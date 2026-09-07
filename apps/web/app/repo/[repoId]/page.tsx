import { IndexingScreen } from "@/components/indexing-screen";
import { SiteFooter } from "@/components/site-footer";
import { TopBar } from "@/components/top-bar";

// O repo_id vive no URL de propósito: é o que faz um refresh, um separador novo
// ou um link partilhado voltarem a apanhar a mesma indexação. Estado em memória
// do React perdia-se e deixava o trabalho a correr sem ninguém a ver.
export default async function RepoPage({
  params,
}: {
  params: Promise<{ repoId: string }>;
}) {
  const { repoId } = await params;

  return (
    <>
      <TopBar />
      <main className="flex flex-1 flex-col items-center px-6 pt-24 pb-24">
        <IndexingScreen repoId={repoId} />
      </main>
      <SiteFooter />
    </>
  );
}
