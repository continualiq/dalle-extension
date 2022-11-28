import backgroundPng from "data-base64:~assets/gradient.png"
import backgroundImg from "data-base64:~assets/gradient.svg"
import logo from "data-base64:~assets/logo_continual.svg"
import cssText from "data-text:~styles.css"
import type {
  PlasmoContentScript,
  PlasmoGetInlineAnchor,
  PlasmoGetRootContainer,
  PlasmoGetShadowHostId,
  PlasmoMountShadowHost,
  PlasmoRender,
} from "plasmo"
import { ChangeEventHandler, useEffect, useState } from "react"

const waitForElement = (selector: string) => {
  return new Promise((resolve) => {
    const observer = new MutationObserver((mutations) => {
      const element = document.querySelector(selector)
      if (element) {
        observer.disconnect()
        resolve(element)
      }
    })
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    })
  })
}

export const getShadowHostId: PlasmoGetShadowHostId = () =>
  "plasmo-prompt-builder-root"

export const getInlineAnchor: PlasmoGetInlineAnchor = () =>
  document.querySelector(".create-page")

export const mountShadowHost: PlasmoMountShadowHost = ({
  shadowHost,
  inlineAnchor,
  observer,
}) => {
  if (inlineAnchor) {
    const parentNode = inlineAnchor.parentNode
    parentNode.insertBefore(shadowHost, inlineAnchor)

    const createPageNodes = document.getElementsByClassName("create-page")
    if (createPageNodes.length > 0) {
      const createPage = createPageNodes[0] as HTMLElement
      createPage.style.paddingTop = "0px !important"
    }

    const createPageExamplesNodes = document.getElementsByClassName(
      "create-page-examples",
    )
    if (createPageExamplesNodes.length > 0) {
      const createPageExample = createPageExamplesNodes[0] as HTMLElement
      createPageExample.style.paddingTop = "40px !important"
    }

    const historyNode = document.getElementsByClassName("create-page-header")
    if (historyNode.length > 0) {
      const node = historyNode[0] as HTMLElement
      node.style.display = "none"
      node.classList.add("hidden")
    }
  }
}

export const config: PlasmoContentScript = {
  matches: ["https://labs.openai.com/*"],
  css: ["../styles.css", "../style-override.css"],
}

export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

const howItWorksSections: { title: string; description: string }[] = [
  {
    title: "Create a prompt",
    description:
      "Type in your prompt or use our prompt builder. Then, click Generate.",
  },
  {
    title: "Iterate on images",
    description: "Create variations of or edit your favorite images.",
  },
  {
    title: "Finalize and print",
    description:
      "Click the Print button to send yourself a digital copy and print your sticker. You can find your sticker at the nearby printer.",
  },
]

const PromptBuilder = () => {
  const [subject, setSubject] = useState("")
  const [activity, setActivity] = useState("")
  const [descriptor, setDescriptor] = useState("")

  useEffect(() => {
    let builder: string[] = []
    if (subject) {
      builder.push(subject)
    }
    if (activity) {
      builder.push(activity)
    }
    if (descriptor) {
      builder.push(descriptor)
    }

    const generatedPrompt = builder.join(" ")
    const nodes = document.getElementsByClassName("image-prompt-input")
    if (nodes.length > 0) {
      const node = nodes[0] as HTMLInputElement
      if (node.value != generatedPrompt) {
        node.value = generatedPrompt
        node.dispatchEvent(new Event("input", { bubbles: true }))
      }
    }
  }, [subject, activity, descriptor])

  const buildPromptSections: {
    title: string
    examples: string[]
    value: string
    onChange: ChangeEventHandler<HTMLInputElement>
  }[] = [
    {
      title: "Subject",
      examples: ["dogs", "cats", "people", "cars"],
      value: subject,
      onChange: (e) => setSubject(e.target.value),
    },
    {
      title: "Activity",
      examples: ["playing in a park", "eating pizza", "building a rocket"],
      value: activity,
      onChange: (e) => setActivity(e.target.value),
    },
    {
      title: "Descriptor",
      examples: ["impressionist", "vaporwave", "cyberpunk", "pop art"],
      value: descriptor,
      onChange: (e) => setDescriptor(e.target.value),
    },
  ]

  return (
    <div
      className="w-[calc(100%+40px)] border-gray-50 rounded-md flex justify-start h-[500px] bg-no-repeat relative mx-[-20px] mt-[-20px] mb-[20px]"
      style={{
        backgroundImage: `url(${backgroundImg})`,
        backgroundSize: "100% auto",
        zIndex: 50,
      }}>
      <div
        className="absolute top-0 left-0 h-full w-full"
        style={{
          background:
            "linear-gradient(52.73deg, #00FFA9 17.5%, #00F9FB 80.05%)",
          opacity: 0.2,
          boxShadow: "0px 1px 4px rgba(0, 0, 0, 0.05)",
        }}
      />

      <div className="flex-col py-8 w-full z-50 text-black font-sans">
        <div className="flex flex-col w-[1240px] mx-auto gap-8">
          <div className="flex w-full justify-between items-start">
            <div>
              <h1 className="mt-0 font-bold font-sans text-2xl mb-4">
                Continual Sticker Bot — Get Your Custom DALL&middot;E 2 Sticker
              </h1>
              <p className="text-secondary font-sans text-gray-500">
                DALL&middot;E is a product of OpenAI and is not affiliated with
                Continual.
              </p>
            </div>
            <img src={logo} className="opacity-100 z-50" />
          </div>

          <section>
            <p className="text-lg mb-4">How It Works</p>
            <div className="flex justify-between gap-4">
              {howItWorksSections.map((section, idx) => (
                <div
                  key={section.title}
                  className="flex justify-start gap-2 w-1/3">
                  <div className="p-4 rounded-full bg-white h-[24px] w-[24px] inline-flex items-center justify-center text-sm font-bold text-black">
                    {idx + 1}
                  </div>
                  <div className="flex flex-col">
                    <h5 className="mb-2 text-black">{section.title}</h5>
                    <p className="text-gray-600">{section.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <p className="text-lg mb-4">Build Your Prompt</p>
            <div className="flex gap-4 justify-between">
              {buildPromptSections.map((section, idx) => (
                <div
                  key={section.title}
                  className="inline-flex flex-col w-1/3 gap-2">
                  <h5 className="mb-2 text-black">{section.title}</h5>
                  <input
                    className="z-50 h-[40px] border border-[#ECECF1] w-full p-[16px]"
                    value={section.value}
                    onChange={section.onChange}
                  />
                  <span className="text-gray-600 text-sm">
                    ex: {section.examples.join(", ")}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default PromptBuilder
