import { useState, useCallback } from "react"
import { ErrorBoundary } from "react-error-boundary"
import { createFileRoute } from "@tanstack/react-router"
import axios from "axios"
import { toast } from "sonner"
import { AlertCircle, RefreshCw } from "lucide-react"

import { OpenAPI } from "@/client"
import { Button } from "@/components/ui/button"
import { CallSetup } from "@/components/Practice/CallSetup"
import { ActiveCall } from "@/components/Practice/ActiveCall"
import { CoachingReport } from "@/components/Practice/CoachingReport"

export const Route = createFileRoute("/_layout/practice")({
  component: Practice,
  head: () => ({
    meta: [{ title: "Practice - Sales Coach" }],
  }),
})

type State =
  | { phase: "setup" }
  | {
      phase: "calling"
      sessionId: string
      accessToken: string
      configId: string
    }
  | { phase: "processing"; sessionId: string }
  | { phase: "report"; sessionId: string }

function Practice() {
  const [state, setState] = useState<State>({ phase: "setup" })

  const handleStart = useCallback(
    (sessionId: string, accessToken: string, configId: string) => {
      setState({ phase: "calling", sessionId, accessToken, configId })
    },
    [],
  )

  const handleAbort = useCallback(() => {
    setState({ phase: "setup" })
  }, [])

  const handleCallEnd = useCallback(
    async (
      transcript: { messages: Array<{ role: string; text: string; timestamp: number }> },
      emotionData: { prosody_scores: Array<Record<string, unknown>> },
    ) => {
      if (state.phase !== "calling") return
      const { sessionId } = state
      setState({ phase: "processing", sessionId })

      try {
        const token = localStorage.getItem("access_token") || ""
        const headers = { Authorization: `Bearer ${token}` }

        // Calculate duration from first to last message
        const timestamps = transcript.messages.map((m) => m.timestamp)
        const duration =
          timestamps.length >= 2
            ? (Math.max(...timestamps) - Math.min(...timestamps)) / 1000
            : 0

        // Complete the call session
        await axios.post(
          `${OpenAPI.BASE}/api/v1/calls/${sessionId}/complete`,
          {
            duration_seconds: Math.max(duration, 1),
            transcript,
            emotion_data: emotionData,
          },
          { headers },
        )

        // Trigger analysis
        await axios.post(
          `${OpenAPI.BASE}/api/v1/calls/${sessionId}/analyze`,
          {},
          { headers },
        )

        setState({ phase: "report", sessionId })
      } catch (err) {
        const detail =
          axios.isAxiosError(err) && err.response?.data?.detail
            ? err.response.data.detail
            : "Failed to save call data. You can retry from the report page."
        toast.error("Network error", { description: detail })
        // Still show report page so user can retry
        setState({ phase: "report", sessionId })
      }
    },
    [state],
  )

  const handleNewCall = useCallback(() => {
    setState({ phase: "setup" })
  }, [])

  switch (state.phase) {
    case "setup":
      return <CallSetup onStart={handleStart} />
    case "calling":
      return (
        <ErrorBoundary
          fallbackRender={({ error, resetErrorBoundary }) => {
            const err = error as Error | undefined
            return (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <h2 className="text-xl font-semibold">Voice call failed to load</h2>
              <p className="text-sm text-muted-foreground max-w-md text-center">
                {err?.message || "An unexpected error occurred while initializing the voice call."}
              </p>
              <pre className="text-xs bg-muted p-3 rounded-md max-w-lg overflow-auto max-h-40">
                {err?.stack || String(error)}
              </pre>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleAbort}>
                  Go Back
                </Button>
                <Button onClick={resetErrorBoundary}>
                  <RefreshCw className="h-4 w-4" />
                  Retry
                </Button>
              </div>
            </div>
            )
          }}
          onReset={() => {
            setState({ phase: "calling", sessionId: state.sessionId, accessToken: state.accessToken, configId: state.configId })
          }}
        >
          <ActiveCall
            accessToken={state.accessToken}
            configId={state.configId}
            onCallEnd={handleCallEnd}
            onAbort={handleAbort}
          />
        </ErrorBoundary>
      )
    case "processing":
    case "report":
      return (
        <CoachingReport
          sessionId={state.sessionId}
          onNewCall={handleNewCall}
        />
      )
  }
}
