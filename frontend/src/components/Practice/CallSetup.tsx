import { useEffect, useState } from "react"
import { Loader2, Phone } from "lucide-react"
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
import { OpenAPI } from "@/client"

type Persona = {
  id: string
  name: string
  description: string
}

type CallSetupProps = {
  onStart: (sessionId: string, accessToken: string, configId: string) => void
}

export function CallSetup({ onStart }: CallSetupProps) {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchPersonas = async () => {
      try {
        const token = localStorage.getItem("access_token") || ""
        const res = await axios.get(
          `${OpenAPI.BASE}/api/v1/calls/personas/list`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        setPersonas(res.data)
        if (res.data.length > 0) {
          setSelected(res.data[0].id)
        }
      } catch {
        setError("Failed to load personas")
        toast.error("Network error", { description: "Could not load personas from server" })
      }
    }
    fetchPersonas()
  }, [])

  const handleStart = async () => {
    if (!selected) return
    setLoading(true)
    setError(null)

    try {
      const token = localStorage.getItem("access_token") || ""
      const headers = { Authorization: `Bearer ${token}` }

      // Create call session
      const sessionRes = await axios.post(
        `${OpenAPI.BASE}/api/v1/calls/`,
        { persona: selected },
        { headers },
      )
      const sessionId = sessionRes.data.id

      // Get Hume access token + config ID from backend
      const tokenRes = await axios.get(
        `${OpenAPI.BASE}/api/v1/hume/token`,
        { headers },
      )
      const accessToken = tokenRes.data.access_token
      const configId = tokenRes.data.config_id || ""

      onStart(sessionId, accessToken, configId)
    } catch (err) {
      const detail =
        axios.isAxiosError(err) && err.response?.data?.detail
          ? err.response.data.detail
          : "Failed to start call. Please try again."
      setError(detail)
      toast.error("Failed to start call", { description: detail })
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Practice Call</h1>
        <p className="text-muted-foreground">
          Select a prospect persona to practice your sales pitch
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {personas.map((persona) => (
          <Card
            key={persona.id}
            className={`cursor-pointer transition-all ${
              selected === persona.id
                ? "ring-2 ring-primary"
                : "hover:border-primary/50"
            }`}
            onClick={() => setSelected(persona.id)}
          >
            <CardHeader>
              <CardTitle className="text-lg">{persona.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{persona.description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <Button
          size="lg"
          onClick={handleStart}
          disabled={!selected || loading}
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Phone />
              Start Call
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
