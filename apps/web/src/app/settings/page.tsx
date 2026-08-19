import type { Metadata } from "next";

import { SettingsForm } from "@/components/settings-form/settings-form";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Display preferences change how lists look for you. They are stored in this browser.
        </p>
      </div>
      <SettingsForm />
    </main>
  );
}
