/**
 * Optional delay for devtools / navigation inspection in development.
 * No-op in production builds.
 */
export async function devNavigationInspectDelay(): Promise<void> {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}
