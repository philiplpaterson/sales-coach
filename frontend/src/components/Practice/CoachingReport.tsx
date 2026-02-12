import { useEffect, useState } from "react"
import { Loader2, RefreshCw, ChevronDown, ChevronUp } from "lucide-react"
import axios from "axios"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { OpenAPI } from "@/client"

type CoachingReportProps = {
  sessionId: string
  onNewCall: () => void
}

type ReportData = {
  overall_score?: number
  tone_summary?: string
  speech_metrics?: {
    words_per_minute?: number
    wpm_assessment?: string
    filler_words?: {
      total?: number
      per_minute?: number
      breakdown?: Record<string, number>
    }
    talk_listen_ratio?: {
      user_percent?: number
      prospect_percent?: number
      assessment?: string
    }
    questions_asked?: number
    longest_monologue_words?: number
  }
  emotion_summary?: {
    dimension_averages?: Record<string, number>
    dominant_emotions?: Array<{ dimension: string; score: number }>
  }
  key_moments?: Array<{
    type: string
    description: string
    suggestion?: string
  }>
  recommendations?: string[]
  strengths?: string[]
  areas_for_improvement?: string[]
  transcript?: {
    messages?: Array<{ role: string; text: string; timestamp: number }>
  }
}

function getScoreColor(score: number): string {
  if (score >= 90) return "text-blue-500"
  if (score >= 70) return "text-green-500"
  if (score >= 40) return "text-yellow-500"
  return "text-red-500"
}

function getScoreBadge(
  score: number,
): "default" | "secondary" | "destructive" | "outline" {
  if (score >= 70) return "default"
  if (score >= 40) return "secondary"
  return "destructive"
}

export function CoachingReport({ sessionId, onNewCall }: CoachingReportProps) {
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showTranscript, setShowTranscript] = useState(true)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let attempts = 0

    const fetchReport = async () => {
      try {
        const token = localStorage.getItem("access_token") || ""
        const res = await axios.get(
          `${OpenAPI.BASE}/api/v1/calls/${sessionId}/report`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (!cancelled) {
          setReport(res.data)
          setLoading(false)
        }
      } catch (err) {
        if (cancelled) return
        if (axios.isAxiosError(err) && err.response?.status === 202) {
          // Still analyzing — poll again after a delay
          attempts++
          if (attempts < 60) {
            timer = setTimeout(fetchReport, 2000)
          } else {
            setError("Analysis is taking longer than expected. Please try refreshing.")
            toast.error("Analysis timeout", { description: "The report is taking longer than expected" })
            setLoading(false)
          }
        } else {
          const detail = axios.isAxiosError(err)
            ? `${err.response?.status ?? "unknown"}: ${JSON.stringify(err.response?.data) ?? err.message}`
            : String(err)
          setError(`Failed to load report — ${detail}`)
          toast.error("Network error", { description: detail })
          setLoading(false)
        }
      }
    }

    fetchReport()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [sessionId, retryKey])

  const handleRetry = async () => {
    setLoading(true)
    setError(null)
    setRetryKey((k) => k + 1)
    try {
      const token = localStorage.getItem("access_token") || ""
      await axios.post(
        `${OpenAPI.BASE}/api/v1/calls/${sessionId}/analyze`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      )
    } catch {
      // Ignore, polling will handle it
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <h2 className="text-xl font-semibold">Analyzing your call...</h2>
        <p className="text-muted-foreground">
          This usually takes 15-30 seconds
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <p className="text-destructive font-medium">Report Error</p>
        <pre className="text-xs bg-muted p-3 rounded-md max-w-lg overflow-auto max-h-40 whitespace-pre-wrap">
          {error}
        </pre>
        <div className="flex gap-2">
          <Button onClick={handleRetry}>
            <RefreshCw className="h-4 w-4" />
            Retry Analysis
          </Button>
          <Button variant="outline" onClick={onNewCall}>
            Start New Call
          </Button>
        </div>
      </div>
    )
  }

  if (!report) return null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Coaching Report
          </h1>
          <p className="text-muted-foreground">
            Here's how you did on your practice call
          </p>
        </div>
        <Button onClick={onNewCall}>Start New Call</Button>
      </div>

      {/* Overall Score */}
      {report.overall_score != null && (
        <Card>
          <CardContent className="flex items-center gap-6 pt-6">
            <div
              className={`text-6xl font-bold ${getScoreColor(report.overall_score)}`}
            >
              {report.overall_score}
            </div>
            <div className="flex-1">
              <Badge variant={getScoreBadge(report.overall_score)}>
                {report.overall_score >= 90
                  ? "Exceptional"
                  : report.overall_score >= 70
                    ? "Good"
                    : report.overall_score >= 40
                      ? "Developing"
                      : "Needs Work"}
              </Badge>
              {report.tone_summary && (
                <p className="mt-2 text-sm">{report.tone_summary}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Speech Metrics */}
      {report.speech_metrics && (
        <Card>
          <CardHeader>
            <CardTitle>Speech Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                label="Words/min"
                value={report.speech_metrics.words_per_minute ?? "—"}
                note={report.speech_metrics.wpm_assessment === "ideal" ? "Ideal pace" : report.speech_metrics.wpm_assessment === "too_slow" ? "Too slow" : "Too fast"}
              />
              <MetricCard
                label="Filler Words"
                value={report.speech_metrics.filler_words?.total ?? 0}
                note={`${report.speech_metrics.filler_words?.per_minute ?? 0}/min`}
              />
              <MetricCard
                label="Talk Ratio"
                value={`${report.speech_metrics.talk_listen_ratio?.user_percent ?? 0}%`}
                note={report.speech_metrics.talk_listen_ratio?.assessment === "ideal" ? "Good balance" : "Needs adjustment"}
              />
              <MetricCard
                label="Questions Asked"
                value={report.speech_metrics.questions_asked ?? 0}
                note="Discovery questions"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Moments */}
      {report.key_moments && report.key_moments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Key Moments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {report.key_moments.map((moment, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 ${
                    moment.type === "strength"
                      ? "border-green-500/30 bg-green-500/5"
                      : "border-orange-500/30 bg-orange-500/5"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        moment.type === "strength" ? "default" : "secondary"
                      }
                    >
                      {moment.type === "strength" ? "Strength" : "Needs Work"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm">{moment.description}</p>
                  {moment.suggestion && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Tip: {moment.suggestion}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Strengths & Areas for Improvement */}
      {((report.strengths && report.strengths.length > 0) || (report.areas_for_improvement && report.areas_for_improvement.length > 0)) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {report.strengths && report.strengths.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-green-500">Strengths</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {report.strengths.map((s, i) => (
                    <li key={i} className="text-sm flex gap-2">
                      <span className="text-green-500 shrink-0">+</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {report.areas_for_improvement && report.areas_for_improvement.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-orange-500">
                  Areas for Improvement
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {report.areas_for_improvement.map((a, i) => (
                    <li key={i} className="text-sm flex gap-2">
                      <span className="text-orange-500 shrink-0">-</span>
                      {a}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Recommendations */}
      {report.recommendations && report.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
            <CardDescription>
              Actionable steps to improve your next call
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 list-decimal list-inside">
              {report.recommendations.map((rec, i) => (
                <li key={i} className="text-sm">
                  {rec}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Emotion Summary */}
      {report.emotion_summary &&
        (report.emotion_summary.dominant_emotions?.length ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Emotional Tone</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {report.emotion_summary.dominant_emotions!.map((e, i) => (
                  <Badge key={i} variant="outline">
                    {e.dimension}: {(e.score * 100).toFixed(0)}%
                  </Badge>
                ))}
              </div>
              {report.emotion_summary.dimension_averages && (
                <div className="mt-4 space-y-2">
                  {Object.entries(report.emotion_summary.dimension_averages).map(
                    ([dim, score]) => (
                      <div key={dim} className="flex items-center gap-2">
                        <span className="text-xs w-24">{dim}</span>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{
                              width: `${Math.min(score * 100, 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

      {/* Collapsible transcript section */}
      <Button
        variant="outline"
        onClick={() => setShowTranscript(!showTranscript)}
        className="w-full"
      >
        {showTranscript ? (
          <>
            <ChevronUp className="h-4 w-4" /> Hide Transcript
          </>
        ) : (
          <>
            <ChevronDown className="h-4 w-4" /> Show Full Transcript
          </>
        )}
      </Button>
      {showTranscript && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {report.transcript?.messages && report.transcript.messages.length > 0 ? (
                report.transcript.messages.map((msg, i) => (
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
                      <span className="text-xs font-medium opacity-70 block mb-1">
                        {msg.role === "user" ? "You" : "Prospect"}
                      </span>
                      {msg.text}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No transcript available.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function MetricCard({
  label,
  value,
  note,
}: {
  label: string
  value: number | string
  note: string
}) {
  return (
    <div className="rounded-lg border p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  )
}
