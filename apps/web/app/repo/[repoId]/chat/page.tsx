import { ChatScreen } from "@/components/chat-screen";

// Rota própria em vez de trocar o conteúdo do /repo/[repoId] quando a indexação
// acaba: quem volta a um repo já indexado entra direto no chat, sem passar pelo
// ecrã de progresso, e o polling de 2 em 2 segundos morre em vez de ficar
// montado por baixo do chat. O ecrã ocupa a viewport toda, por isso não leva a
// TopBar nem o SiteFooter das páginas de marketing.
export default async function ChatPage({
  params,
}: {
  params: Promise<{ repoId: string }>;
}) {
  const { repoId } = await params;

  return <ChatScreen repoId={repoId} />;
}
