/**
 * Layout for /agents/* pages.
 * These pages host the AiAgent component full-screen — no studio chrome needed.
 * Provider credentials remain server-side and are resolved per active workspace.
 */
export const metadata = {
  title: "Agent Chat — Open Generative AI",
};

export default function AgentsLayout({ children }) {
  return (
    <div className="cr-studio-gradient h-screen w-full overflow-hidden">
      {children}
    </div>
  );
}
