import { Link, useRouter } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"

const ErrorComponent = ({ error }: { error?: unknown }) => {
  const err = error as Error | undefined
  const router = useRouter()

  return (
    <div
      className="flex min-h-screen items-center justify-center flex-col p-4"
      data-testid="error-component"
    >
      <div className="flex items-center z-10">
        <div className="flex flex-col ml-4 items-center justify-center p-4">
          <span className="text-6xl md:text-8xl font-bold leading-none mb-4">
            Error
          </span>
          <span className="text-2xl font-bold mb-2">Oops!</span>
        </div>
      </div>

      <p className="text-lg text-muted-foreground mb-4 text-center z-10">
        Something went wrong. Please try again.
      </p>
      {err && (
        <pre className="text-xs bg-muted p-4 rounded-md max-w-2xl overflow-auto max-h-60 whitespace-pre-wrap mb-4 z-10">
          {err.message}
          {err.stack && `\n\n${err.stack}`}
        </pre>
      )}
      {!err && error != null && (
        <pre className="text-xs bg-muted p-4 rounded-md max-w-2xl overflow-auto max-h-60 whitespace-pre-wrap mb-4 z-10">
          {String(error)}
        </pre>
      )}
      <div className="flex gap-2 z-10">
        <Button variant="outline" onClick={() => router.invalidate()}>
          Retry
        </Button>
        <Link to="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    </div>
  )
}

export default ErrorComponent
