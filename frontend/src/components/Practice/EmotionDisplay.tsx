import { cn } from "@/lib/utils"

type EmotionScore = {
  name: string
  score: number
}

type EmotionDisplayProps = {
  emotions: EmotionScore[]
}

const EMOTION_COLORS: Record<string, string> = {
  Confidence: "bg-blue-500",
  Enthusiasm: "bg-green-500",
  Joy: "bg-yellow-500",
  Interest: "bg-teal-500",
  Doubt: "bg-orange-500",
  Confusion: "bg-purple-500",
  Anxiety: "bg-red-400",
  Determination: "bg-indigo-500",
  Excitement: "bg-emerald-500",
  Sympathy: "bg-pink-500",
}

export function EmotionDisplay({ emotions }: EmotionDisplayProps) {
  if (emotions.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        Waiting for emotion data...
      </div>
    )
  }

  // Show top 5 emotions
  const topEmotions = emotions.slice(0, 5)

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">
        Live Emotions
      </h3>
      {topEmotions.map((emotion) => (
        <div key={emotion.name} className="flex items-center gap-2">
          <span className="text-xs w-24 truncate">{emotion.name}</span>
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                EMOTION_COLORS[emotion.name] || "bg-primary",
              )}
              style={{ width: `${Math.min(emotion.score * 100, 100)}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground w-10 text-right">
            {(emotion.score * 100).toFixed(0)}%
          </span>
        </div>
      ))}
    </div>
  )
}
