import { useCallback, useEffect, useRef, useState } from "react"
import { PhoneOff, RefreshCw, MicVocal } from "lucide-react"
import {
  VoiceProvider,
  useVoice,
  VoiceReadyState,
} from "@humeai/voice-react"
import type { JSONMessage } from "@humeai/voice-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { EmotionDisplay } from "./EmotionDisplay"

type ActiveCallProps = {
  accessToken: string
  configId: string
  onCallEnd: (transcript: TranscriptData, emotionData: EmotionDataPayload) => void
  onAbort: () => void
}

type TranscriptMessage = {
  role: "user" | "assistant"
  text: string
  timestamp: number
}

type ProsodyReading = {
  role: "user" | "assistant"
  emotions: Record<string, number>
  timestamp: number
}

type TranscriptData = {
  messages: TranscriptMessage[]
}

type EmotionDataPayload = {
  prosody_scores: ProsodyReading[]
}

type EmotionScore = {
  name: string
  score: number
}

export function ActiveCall({
  accessToken,
  configId,
  onCallEnd,
  onAbort,
}: ActiveCallProps) {
  const transcriptRef = useRef<TranscriptMessage[]>([])
  const prosodyRef = useRef<ProsodyReading[]>([])
  const [displayMessages, setDisplayMessages] = useState<TranscriptMessage[]>([])
  const [currentEmotions, setCurrentEmotions] = useState<EmotionScore[]>([])
  const [micDialogOpen, setMicDialogOpen] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)

  // Single source of truth for transcript.
  //
  // Hume sends progressive transcription: while the user is still speaking
  // it emits multiple user_message events, each one a longer version of the
  // same utterance. We REPLACE the last entry when the role is the same
  // (progressive update within one turn) and only APPEND when the role
  // switches (new turn).
  const handleMessage = useCallback((message: JSONMessage) => {
    const now = Date.now()

    let role: "user" | "assistant" | null = null
    let text = ""
    let scores: Record<string, number> | undefined

    if (message.type === "user_message") {
      const userMsg = message as JSONMessage & {
        message?: { content?: string }
        models?: { prosody?: { scores?: Record<string, number> } }
      }
      role = "user"
      text = userMsg.message?.content || ""
      scores = userMsg.models?.prosody?.scores
    } else if (message.type === "assistant_message") {
      const assistantMsg = message as JSONMessage & {
        message?: { content?: string }
        models?: { prosody?: { scores?: Record<string, number> } }
      }
      role = "assistant"
      text = assistantMsg.message?.content || ""
      scores = assistantMsg.models?.prosody?.scores
    }

    if (role && text) {
      const entry: TranscriptMessage = { role, text, timestamp: now }
      const prev = transcriptRef.current[transcriptRef.current.length - 1]

      if (role === "user" && prev && prev.role === "user") {
        // Same user turn → progressive transcription update, replace it
        transcriptRef.current[transcriptRef.current.length - 1] = entry
        setDisplayMessages(msgs => {
          const next = msgs.slice(0, -1)
          next.push(entry)
          return next
        })
      } else {
        // New turn or assistant message → always append
        transcriptRef.current.push(entry)
        setDisplayMessages(msgs => [...msgs, entry])
      }
    }

    if (scores) {
      prosodyRef.current.push({
        role: role!,
        emotions: scores,
        timestamp: now,
      })
      if (role === "user") {
        const sorted = Object.entries(scores)
          .map(([name, score]) => ({ name, score }))
          .sort((a, b) => b.score - a.score)
        setCurrentEmotions(sorted)
      }
    }
  }, [])

  const handleError = useCallback((err: { type: string; reason?: string; message?: string }) => {
    if (err.type === "mic_error" && err.reason === "mic_permission_denied") {
      setMicDialogOpen(true)
    } else if (err.type === "socket_error") {
      setConnectionError(err.message || "Connection to voice service failed")
      toast.error("Connection error", {
        description: err.message || "Failed to connect to voice service",
      })
    } else {
      toast.error("Voice error", {
        description: err.message || "An unexpected error occurred",
      })
    }
  }, [])

  const handleCallEnd = useCallback(() => {
    onCallEnd(
      { messages: transcriptRef.current },
      { prosody_scores: prosodyRef.current },
    )
  }, [onCallEnd])

  return (
    <>
      <VoiceProvider
        onMessage={handleMessage}
        onError={handleError}
        clearMessagesOnDisconnect={false}
        messageHistoryLimit={500}
      >
        <ActiveCallUI
          accessToken={accessToken}
          configId={configId}
          displayMessages={displayMessages}
          currentEmotions={currentEmotions}
          connectionError={connectionError}
          onClearConnectionError={() => setConnectionError(null)}
          onEndCall={handleCallEnd}
          onAbort={onAbort}
        />
      </VoiceProvider>

      <Dialog open={micDialogOpen} onOpenChange={setMicDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MicVocal className="h-5 w-5" />
              Microphone Access Required
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2">
                <p>
                  Sales Coach needs access to your microphone for the practice
                  call. Your browser blocked the request.
                </p>
                <p className="font-medium">How to fix this:</p>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>Click the lock/site-settings icon in your browser address bar</li>
                  <li>Find &quot;Microphone&quot; and change it to &quot;Allow&quot;</li>
                  <li>Refresh the page and try again</li>
                </ol>
                <p className="text-xs text-muted-foreground">
                  Your audio is only used for the live call and is not stored on
                  our servers.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setMicDialogOpen(false); onAbort() }}>
              Go Back
            </Button>
            <Button onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ActiveCallUI({
  accessToken,
  configId,
  displayMessages,
  currentEmotions,
  connectionError,
  onClearConnectionError,
  onEndCall,
  onAbort,
}: {
  accessToken: string
  configId: string
  displayMessages: TranscriptMessage[]
  currentEmotions: EmotionScore[]
  connectionError: string | null
  onClearConnectionError: () => void
  onEndCall: () => void
  onAbort: () => void
}) {
  const {
    connect,
    disconnect,
    status,
    readyState,
    isPlaying,
    isMuted,
    callDurationTimestamp,
  } = useVoice()

  const [retrying, setRetrying] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const hasConnected = useRef(false)

  const doConnect = useCallback(() => {
    return connect({
      auth: { type: "accessToken", value: accessToken },
      configId: configId || undefined,
    })
  }, [accessToken, configId, connect])

  // Connect on mount — let Hume handle the conversation naturally via its
  // own VAD. No mute/unmute, no pause/resume.
  useEffect(() => {
    if (hasConnected.current) return
    hasConnected.current = true
    doConnect().catch(() => {
      // Errors handled by onError callback in VoiceProvider
    })
  }, [doConnect])

  const handleRetry = async () => {
    setRetrying(true)
    onClearConnectionError()
    try {
      await doConnect()
    } catch {
      // Errors handled by onError callback
    } finally {
      setRetrying(false)
    }
  }

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [displayMessages])

  const handleEndCall = async () => {
    await disconnect()
    onEndCall()
  }

  const isConnected = readyState === VoiceReadyState.OPEN

  const statusColor =
    status.value === "connected"
      ? "default"
      : status.value === "connecting"
        ? "secondary"
        : "destructive"

  const statusLabel =
    readyState === VoiceReadyState.OPEN
      ? "Connected"
      : readyState === VoiceReadyState.CONNECTING
        ? "Connecting..."
        : "Disconnected"

  const isListening = isConnected && !isMuted && !isPlaying

  return (
    <div className="flex flex-col gap-4">
      {/* Connection error banner with retry */}
      {connectionError && readyState !== VoiceReadyState.OPEN && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-destructive">Connection Failed</p>
            <p className="text-xs text-muted-foreground mt-1">{connectionError}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onAbort}>
              Go Back
            </Button>
            <Button size="sm" onClick={handleRetry} disabled={retrying}>
              {retrying ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Active Call</h1>
          <Badge variant={statusColor}>{statusLabel}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {callDurationTimestamp && (
            <span className="text-sm font-mono text-muted-foreground">
              {callDurationTimestamp}
            </span>
          )}
          <Button variant="destructive" onClick={handleEndCall}>
            <PhoneOff className="h-4 w-4" />
            End Call
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Transcript */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Transcript</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[350px] overflow-y-auto space-y-3 pr-2">
              {displayMessages.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {isConnected
                    ? "Start speaking — the prospect will respond automatically."
                    : "Connecting to voice service..."}
                </p>
              )}
              {displayMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Speaking indicator */}
            {isConnected && (
              <div className="mt-4 flex items-center justify-center gap-3 border-t pt-4">
                {isPlaying ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
                    </span>
                    Prospect is speaking...
                  </div>
                ) : isListening ? (
                  <div className="flex items-center gap-2 text-sm text-green-500">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
                    </span>
                    Listening — speak naturally, the prospect will respond when you pause
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Ready — start speaking anytime
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Emotion sidebar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tone Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <EmotionDisplay emotions={currentEmotions} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
