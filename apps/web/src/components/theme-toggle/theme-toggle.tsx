"use client";

import { useLayoutEffect, useState, type ComponentProps } from "react";
import { Moon, Sun } from "lucide-react";

import { applyTheme, resolveInitialTheme, storeTheme } from "@/lib/theme";
import { useMounted } from "@/hooks/use-mounted";
import { Button } from "@/components/ui/button";

/**
 * Switches TalentScout between the light and dark palettes and remembers the choice.
 *
 * The visible icon is driven by the `dark` variant rather than by React state, so it cannot
 * disagree with the class the layout's inline script already applied before the first paint.
 */
function ThemeToggle(props: ComponentProps<typeof Button>) {
  const mounted = useMounted();
  const [theme, setTheme] = useState(resolveInitialTheme);
  const isDark = theme === "dark";

  // The layout's inline script already set this class while the browser parsed the document.
  // React's Strict Mode remount in development then resets <html> to the attributes it manages
  // from JSX, stripping it — re-applying before paint restores it. A no-op in production.
  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggleTheme() {
    const next = isDark ? "light" : "dark";
    setTheme(next);
    storeTheme(next);
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      // Withheld until hydration: the server cannot know the stored preference, so rendering it
      // any earlier is the one output that would make React's first client render disagree.
      aria-pressed={mounted ? isDark : undefined}
      onClick={toggleTheme}
      {...props}
    >
      <Sun aria-hidden="true" className="dark:hidden" />
      <Moon aria-hidden="true" className="hidden dark:block" />
      <span className="sr-only">Dark theme</span>
    </Button>
  );
}

export { ThemeToggle };
