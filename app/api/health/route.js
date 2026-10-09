export async function GET() {
  return Response.json({ status: 'ok', product: 'Creatora AI', timestamp: new Date().toISOString() });
}
