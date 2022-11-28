import os
import base64
import sqlite3
from textwrap import dedent
import traceback
import uuid
from typing import List, Tuple
import urllib.parse

import time
from datetime import date, datetime
import dotenv
import uvicorn

import requests
from io import BytesIO
from PIL import Image

from fastapi import BackgroundTasks, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi_utils.tasks import repeat_every

from pydantic import BaseModel

from transformers import pipeline, set_seed
import random
import re

import sendgrid

from sendgrid.helpers.mail import (
    Mail,
    Attachment,
    FileContent,
    FileName,
    FileType,
    Disposition,
    ContentId,
)

dotenv.load_dotenv(".env")

# create our client instance and pass it our key
sg = sendgrid.SendGridAPIClient(os.environ.get("SENDGRID_API_KEY"))

gpt2_pipe = pipeline("text-generation", model="succinctly/text2image-prompt-generator")

BATCH_SIZE = 6
MAX_DURATION_BETWEEN_PRINTS = 60 * 5  # 5 minutes
PROCESSED_BATCHES_DIR = "processed_batches"
PROCESSED_IMAGES_DIR = "processed_images"


def generate_from_prompt(starting_text) -> str:
    seed = random.randint(100, 1000000)
    set_seed(seed)

    response = gpt2_pipe(
        starting_text, max_length=random.randint(60, 90), num_return_sequences=1
    )
    response_list = []
    for x in response:
        resp = x["generated_text"].strip()
        resp_tokens = resp.split()
        resp_words = []
        skip_next = False

        for token in resp_tokens:
            if skip_next is False:
                if (
                    token.find("-") == -1
                    and token.find("—") == -1
                    and token.find(":") == -1
                ):
                    resp_words.append(token)
            else:
                skip_next = False

            if token.find("--w") != -1 or token.find("--h") != -1:
                skip_next = True

        resp_sentence = " ".join(resp_words)
        resp = resp_sentence

        if (
            resp != starting_text
            and len(resp) > (len(starting_text) + 4)
            and resp.endswith((":", "-", "—")) is False
        ):
            response_list.append(resp)

    response_end = "\n".join(response_list)
    response_end = re.sub("[^ ]+\.[^ ]+", "", response_end)
    response_end = response_end.replace("<", "").replace(">", "")
    if response_end != "":
        return response_end


def send_image_to_email(image_url: str, email: str):
    """Reads from a file (assumed to exist), encodes the binary, then
    sends it as an email attachment to specified address

    :returns API response code
    :raises Exception e: raises an exception"""
    # create our message object

    tweet_link = "https://twitter.com/intent/tweet?text={}".format(
        urllib.parse.quote_plus(
            "Made with my #ContinualImagination and @OpenAI’s DALL-E 2 in the @continual_ai booth at #TMLS2022"
        )
    )
    message = Mail(
        from_email="Continual <hello@continual.ai>",
        to_emails=[email],
        subject="Your DALL-E 2 image is ready!",
        html_content=dedent(
            f"""
            <p>Hey,</p>
            <p>Thanks for coming by the Continual booth at TMLS 2022!</p>
            <p>We've attached your generated image to this email. Enjoy!</p>
            <p>Feel like sharing? <a href="{tweet_link}" target="_blank">Click</a> to Tweet your creation!</p>
            <p>Note: you will need to download your image and attach it to your tweet.</p>
            <span>Best,</span>
            <p>the Continual team</p>
            """
        ),
    )

    res = requests.get(image_url)
    data = BytesIO(res.content).getvalue()

    # create our attachment object, first pass the binary data above to base64 for encoding
    encoded_file = base64.b64encode(data).decode()
    # attach the file and set its properties, info here: https://sendgrid.com/docs/API_Reference/Web_API_v3/Mail/index.html
    attachedFile = Attachment(
        FileContent(encoded_file),
        FileName("image.png"),
        FileType("image/png"),
        Disposition("attachment"),
    )
    message.attachment = attachedFile
    response = None
    try:
        response = sg.send(message)
        code, body, headers = response.status_code, response.body, response.headers
        print(f"Response code: {code}")
        print(f"Response headers: {headers}")
        print(f"Response body: {body}")
        print("Email send data has been sent as an attachment")
    except Exception as e:
        print("Error: {0}".format(e))
    print(response)


class PrintRequest(BaseModel):
    name: str
    email: str
    company: str
    image_url: str


class Prompt(BaseModel):
    text: str


app = FastAPI(debug=False)
origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://labs.openai.com", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
if not os.path.exists(PROCESSED_IMAGES_DIR):
    os.mkdir(PROCESSED_IMAGES_DIR)
if not os.path.exists(PROCESSED_BATCHES_DIR):
    os.mkdir(PROCESSED_BATCHES_DIR)


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect("coalesce.db")
    return conn


@app.get("/")
def index():
    return {"healthy": True}


@app.post("/print")
def post(req: PrintRequest, background_tasks: BackgroundTasks):
    conn = get_connection()
    cur = conn.cursor()
    success = False
    try:
        cur.execute(
            "INSERT INTO users (name, email, company) VALUES (?, ?, ?)",
            (req.name, req.email, req.company),
        )
        cur.execute(
            "INSERT INTO generated_images (email, image_url) VALUES (?, ?)",
            (req.email, req.image_url),
        )
        conn.commit()
        success = True
    except Exception as e:
        print("Error inserting user:", e)
    finally:
        conn.close()

    should_print_now, image_urls = should_print()
    do_print(image_urls)

    background_tasks.add_task(send_image_to_email(req.image_url, req.email))

    return {"success": success, "should_print_now": should_print_now}


def should_print() -> Tuple[bool, List[str]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, ts, email, image_url FROM generated_images WHERE printed = false ORDER BY ts ASC"
    )
    rows = cur.fetchall()
    images = list(map(lambda x: x[3], rows))

    conn.close()

    if len(rows) >= BATCH_SIZE:
        return True, images

    return False, images


def maybe_print():
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT id, ts, email, image_url FROM generated_images WHERE printed = false ORDER BY ts ASC"
        )
        rows = cur.fetchall()
        print("rows: ", rows)
        for idx, row in enumerate(rows):
            print("row #", idx, row)
        if len(rows) >= BATCH_SIZE:
            do_print(list(map(lambda x: x[3], rows)))

    except Exception as e:
        print("Error while printing:", e)
        traceback.print_exc()
    finally:
        conn.close()


def do_print(image_urls: List[str], mark_printed: bool = True):
    print("do_print() called with images -> ", image_urls)
    if not image_urls:
        print("no images passed to do_print(), returning")
        return
    elif len(image_urls) < BATCH_SIZE:
        image_urls = image_urls + [image_urls[0]] * (BATCH_SIZE - len(image_urls))
    elif len(image_urls) > BATCH_SIZE:
        print("too many images passed to do_print(), using only the first", BATCH_SIZE)
        image_urls = image_urls[:BATCH_SIZE]

    # Canvas = 8.5x11 inches at 300 DPI is 2250x3300px
    # dalle2 images = 1024x1024px / 72 DPI
    width = 2550
    height = 3300

    # Create blank canvas
    canvas = Image.new("RGB", (width, height), color=(255, 255, 255))

    # Slots are where the stickers are on the sheet. Slot coordinates are the upper left corner. They are in the list in the following order:
    # Top left, top right, middle left, middle right, bottom left, bottom right
    slots = [
        (135, 130),
        (1460, 130),
        (142, 1185),
        (1461, 1185),
        (135, 2235),
        (1463, 2235),
    ]

    # Coordinates of where the Continual logo should be placed
    branding_pos = (0, 0)

    branding = Image.open("Dalle_template.png")

    image_filenames = list()

    for idx, url in enumerate(image_urls):
        res = requests.get(url)
        img = Image.open(BytesIO(res.content))

        # save image locally
        img_filename = f"{PROCESSED_IMAGES_DIR}/{str(uuid.uuid4())}.png"
        image_filenames.append(img_filename)
        img.save(img_filename)

        img.paste(branding, branding_pos, mask=branding)

        img.thumbnail((942, 942), Image.ANTIALIAS)

        # Paste Dalle2 image onto canvas
        canvas.paste(img, slots[idx])

    # canvas.show()
    filename = (
        str(date.today().strftime("%Y%m%d%H%M%S"))
        + "_"
        + str(int(time.time()))
        + ".pdf"
    )
    filename = f"{PROCESSED_BATCHES_DIR}/{filename}"

    print("saving canvas to", filename)

    canvas.save(filename, format="pdf")

    # Do the printing
    # os.startfile(filename, "print")
    print("Submitting job to printer ...")
    try:
        os.system(
            f"lp -o fit-to-page -o scale=100 -o sides=one-sided -o quality=best {filename}"
        )
    except Exception as e:
        print("Error while  printing:", e)
        traceback.print_exc()
    # os.system("lp -d HP_LaserJet_Pro_MFP_M227fdw_series " + filename)

    print("Marking images as printed ...")
    if mark_printed:
        try:
            conn = get_connection()
            cur = conn.cursor()
            for (img, img_filename) in zip(image_urls, image_filenames):
                cur.execute(
                    "UPDATE generated_images SET printed = true, file_name = ? WHERE image_url = ?",
                    (
                        img_filename,
                        img,
                    ),
                )
            conn.commit()
            conn.close()
        except Exception as e:
            print("Error while marking images as printed:", e)

    print("Done printing!")


@app.post("/testprinter")
def testprint():
    try:
        # images = [
        #     "https://cdn.openai.com/labs/images/A photo of a white fur monster standing in a purple room.webp?v=1",
        #     "https://cdn.openai.com/labs/images/A 3D render of an astronaut walking in a green desert.webp?v=1",
        #     "https://cdn.openai.com/labs/images/A cartoon of a monkey in space.webp?v=1",
        #     "https://cdn.openai.com/labs/images/A blue orange sliced in half laying on a blue floor in front of a blue wall.webp?v=1",
        #     "https://cdn.openai.com/labs/images/An expressive oil painting of a basketball player dunking, depicted as an explosion of a nebula.webp?v=1",
        #     "https://cdn.openai.com/labs/images/A photo of a Samoyed dog with its tongue out hugging a white Siamese cat.webp?v=1",
        # ]
        images = [
            "https://cdn.openai.com/labs/images/A Shiba Inu dog wearing a beret and black turtleneck.webp?v=1",
            "https://cdn.openai.com/labs/images/A comic book cover of a superhero wearing headphones.webp?v=1",
            "https://cdn.openai.com/labs/images/A cat riding a motorcycle.webp?v=1",
            "https://cdn.openai.com/labs/images/A photograph of a sunflower with sunglasses on in the middle of the flower in a field on a bright sunny day.webp?v=1",
            "https://cdn.openai.com/labs/images/A handpalm with a tree growing on top of it.webp?v=1",
            "https://cdn.openai.com/labs/images/An oil pastel drawing of an annoyed cat in a spaceship.webp?v=1",
        ]
        # images = images + [images[0]] * (BATCH_SIZE - len(images))
        do_print(images, mark_printed=False)
    except Exception as e:
        print("Error while printing:", e)
        traceback.print_exc()


@app.post("/testemail")
def testemail():
    try:
        images = [
            "https://cdn.openai.com/labs/images/A Shiba Inu dog wearing a beret and black turtleneck.webp?v=1",
            "https://cdn.openai.com/labs/images/A comic book cover of a superhero wearing headphones.webp?v=1",
            "https://cdn.openai.com/labs/images/A cat riding a motorcycle.webp?v=1",
            "https://cdn.openai.com/labs/images/A photograph of a sunflower with sunglasses on in the middle of the flower in a field on a bright sunny day.webp?v=1",
            "https://cdn.openai.com/labs/images/A handpalm with a tree growing on top of it.webp?v=1",
            "https://cdn.openai.com/labs/images/An oil pastel drawing of an annoyed cat in a spaceship.webp?v=1",
        ]
        url = random.choice(images)
        send_image_to_email(url, "sahil@continual.ai")
    except Exception as e:
        print("Error while printing:", e)
        traceback.print_exc()


@app.post("/generate")
def generate(prompt: Prompt):
    completion = generate_from_prompt(prompt.text)
    print(f"Input: {prompt.text}\nCompletion: {completion}")

    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO prompt_completions (prompt, generated_text) VALUES (?, ?)",
            (prompt.text, completion or ""),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print("Got an error while processing: ", e)
    finally:
        conn.close()

    return {"completion": completion}
