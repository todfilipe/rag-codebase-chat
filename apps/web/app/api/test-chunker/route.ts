import { chunkText } from "@/lib/chunker";

// Diagnóstico: valida o chunker num texto de exemplo. Apagar quando o indexer estiver pronto.
const SAMPLE_TEXT = `[START]
function generateUserToken(user: User): string {
  const payload = { id: user.id, email: user.email };
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: "1h" });
}

function verifyUserToken(token: string): UserPayload | null {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as UserPayload;
  } catch {
    return null;
  }
}

${"// linha de preenchimento para chegar a ~3000 chars\n".repeat(40)}
[MID]
async function loginUser(email: string, password: string) {
  const user = await db.users.findOne({ email });
  if (!user) throw new Error("user not found");
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error("invalid password");
  return generateUserToken(user);
}

${"// mais preenchimento\n".repeat(40)}
[END]`;

export async function GET() {
  try {
    const chunks = chunkText(SAMPLE_TEXT);
    return Response.json({
      totalLength: SAMPLE_TEXT.length,
      chunkCount: chunks.length,
      chunks: chunks.map((c, i) => ({
        index: i,
        start: c.start,
        end: c.end,
        size: c.end - c.start,
        preview: {
          first80: c.content.slice(0, 80),
          last80: c.content.slice(-80),
        },
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    return Response.json({ error: message }, { status: 500 });
  }
}
