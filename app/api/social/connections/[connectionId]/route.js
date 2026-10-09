import { NextResponse } from "next/server";
import { disconnectSocialTarget } from "@/lib/socialConnectionScope";

// Disconnect exactly one connected account. The target is the destination id
// shown in Settings → Connections; workspace membership and Owner/Admin
// permission are resolved on the server, never trusted from the browser.
export async function DELETE(request, { params }) {
  try {
    const targetId = (await params)?.connectionId;
    if (!targetId) return NextResponse.json({ error: "Connection ID is required." }, { status: 400 });
    const result = await disconnectSocialTarget(request, targetId);
    return NextResponse.json({
      disconnected: true,
      id: result.destination?.id || result.connection.id,
      connectionId: result.connection.id,
      provider: result.destination?.provider || result.connection.provider,
      accountName: result.destination?.accountName || result.connection.accountName,
      connectionRetired: result.connectionRetired,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Unable to disconnect social connection." },
      { status: error.status || 403 }
    );
  }
}