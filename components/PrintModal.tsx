import logoSvg from "data-base64:~assets/logo_continual.svg"
import React, { useEffect, useState } from "react"

interface PrintModalProps {
  visible: boolean
  imageUrl?: string
  onClose: () => void
  shadowHostId?: string
}

function useTimeout(callback: () => void, delay: number) {
  const timeoutRef = React.useRef(null)
  const savedCallback = React.useRef(callback)
  React.useEffect(() => {
    savedCallback.current = callback
  }, [callback])
  React.useEffect(() => {
    const tick = () => savedCallback.current()
    if (typeof delay === "number") {
      timeoutRef.current = window.setTimeout(tick, delay)
      return () => window.clearTimeout(timeoutRef.current)
    }
  }, [delay])
  return timeoutRef
}

const PrintModal: React.FC<PrintModalProps> = ({
  visible,
  imageUrl,
  shadowHostId,
  onClose,
}) => {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [company, setCompany] = useState("")

  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [printingNow, setPrintingNow] = useState(false)

  const [submitLoading, setSubmitLoading] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)

  useTimeout(
    () => {
      window.location.href = "https://labs.openai.com"
    },
    success ? 30000 : null,
  )

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }
    document.addEventListener("keydown", handleEscape, false)

    return () => {
      document.removeEventListener("keydown", handleEscape, false)
    }
  }, [])

  useEffect(() => {
    if (visible && !modalOpen) {
      openModal()
    } else if (!visible && modalOpen) {
      closeModal()
    }
  }, [visible])

  const openModal = (
    e?: React.MouseEvent<HTMLDivElement> | React.MouseEvent<HTMLButtonElement>,
  ) => {
    e?.stopPropagation()

    if (shadowHostId) {
      const root = document.getElementById(shadowHostId).shadowRoot
      root.getElementById("dialog").style.display = "block"
      root.getElementById("overlay").style.display = "block"
    } else {
      const dialog = document.getElementById("dialog")
      dialog.style.display = "block"

      const overlay = document.getElementById("overlay")
      overlay.style.display = "block"
    }

    setModalOpen(true)
  }

  const closeModal = (
    e?: React.MouseEvent<HTMLButtonElement> | React.MouseEvent<HTMLDivElement>,
  ) => {
    e?.stopPropagation()

    if (shadowHostId) {
      const root = document.getElementById(shadowHostId).shadowRoot
      root.getElementById("dialog").style.display = "none"
      root.getElementById("overlay").style.display = "none"
    } else {
      const dialog = document.getElementById("dialog")
      dialog.style.display = "none"

      const overlay = document.getElementById("overlay")
      overlay.style.display = "none"
    }

    if (success) {
      setSuccess(false)
    }

    setModalOpen(false)
    onClose()
  }

  const handleSubmit = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()

    setError("")

    if (!name || !email || !company) {
      setError("Please fill out all of the fields")
    }

    try {
      const res = await fetch("http://localhost:8000/print", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          company,
          image_url: imageUrl,
        }),
      })

      const data = await res.json()

      setSuccess(true)
      setPrintingNow(data?.is_printing_now || data?.isPrintingNow)
      setName("")
      setEmail("")
      setCompany("")
    } catch (err) {
      setError(
        "Something went wrong while printing. Please notify a Continual member so we can fix it!",
      )
      console.error(err)
    }
  }

  return (
    <>
      <div
        id="overlay"
        className="fixed z-[999] w-screen h-screen inset-0 bg-gray-900 bg-opacity-60"
        style={{ display: "none" }}
        onClick={closeModal}
      />
      <div
        id="dialog"
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1/3 bg-white rounded-[6px] p-6 space-y-5 drop-shadow-lg z-[1000]"
        style={{ display: "none" }}
        onClick={(e) => e.stopPropagation()}>
        {!imageUrl ? (
          <>
            <p className="text-red-500">
              Something went wrong. Please notify a Continual team member for
              assistance.
            </p>
            <button
              className="bg-transparent border-none text-black"
              onClick={() =>
                (window.location.href = "https://labs.openai.com")
              }>
              Back to Home
            </button>
            <button
              className="bg-transparent border-none text-black"
              onClick={closeModal}>
              Close
            </button>
          </>
        ) : success ? (
          <div className="flex flex-col gap-4 text-center">
            <p className="text-green-500 text-xl">
              Your sticker has been submitted to the printer!
            </p>
            {!printingNow ? (
              <span className="text-gray-600">
                Your sticker has been added to the queue. It will be printed in
                the next batch of 6. Feel free to add more images!
              </span>
            ) : (
              <span className="text-gray-600">
                Please find a printer near you. Note that the sticker may not
                print immediately.
              </span>
            )}

            <button
              className="bg-transparent border-none text-black"
              onClick={() =>
                (window.location.href = "https://labs.openai.com")
              }>
              Back to Home
            </button>
            <button
              className="bg-transparent border-none text-black"
              onClick={closeModal}>
              Close
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center text-center w-full gap-4">
              <div className="w-1/3">
                <img src={logoSvg} />
              </div>
              <h2 className="text-black font-bold text-lg">
                Print Your Sticker
              </h2>
              <span className="text-secondary">
                Enter your information below to print your sticker.
              </span>
              <span className="text-secondary">
                In order to not waste as much paper, we are printing stickers in
                batches of 6. Your sticker may not print immediately.
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="name">Name</label>
              <input
                type="text"
                name="name"
                className="px-4 py-2 border border-[#ECECF1]"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
                spellCheck="false"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                name="email"
                className="px-4 py-2 border border-[#ECECF1]"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                spellCheck="false"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="company">Company</label>
              <input
                type="text"
                name="company"
                className="px-4 py-2 border border-[#ECECF1]"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                autoComplete="off"
                spellCheck="false"
              />
            </div>

            {error && <span className="text-red-500">{error}</span>}
          
            { submitLoading ? (
              <button
                className="bg-black rounded-[4px] text-white h-[46px] hover:opacity-60 disabled"
                onClick={handleSubmit}>
                Submitting ...
              </button>
            ) : (
              <button
                className="bg-black rounded-[4px] text-white h-[46px] hover:opacity-60"
                onClick={handleSubmit}>
                Send and Print
              </button>
            )}
            
            <button
              className="w-full text-black hover:opacity-60"
              onClick={closeModal}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </>
  )
}

export default PrintModal
