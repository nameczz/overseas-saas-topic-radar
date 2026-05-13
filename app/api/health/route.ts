export async function GET() {
  return Response.json({ ok: true, at: new Date().toISOString(), service: "overseas-saas-topic-radar" });
}
