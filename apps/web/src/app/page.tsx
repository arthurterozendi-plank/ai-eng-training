import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">ai-eng-training</h1>
      <p className="text-center text-sm text-muted-foreground">
        Next.js + TypeScript + Tailwind + shadcn/ui scaffold.
      </p>
      <Button>Get started</Button>
    </main>
  );
}
