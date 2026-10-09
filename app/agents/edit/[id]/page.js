import AgentEditClient from "./AgentEditClient";
import { getCurrentMuApiContext } from "@/lib/currentMuApiCredential";

const BASE_URL = 'https://api.muapi.ai';

async function fetchUserData(apiKey) {
  if (!apiKey) return null;
  try {
    const res = await fetch(`${BASE_URL}/api/v1/account/balance`, {
      cache: "no-store",
      headers: { "x-api-key": apiKey },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function EditAgentPage({ params }) {
  const { id } = await params; // although we don't use id on server here, it's used by useParams in client
  const apiKey = (await getCurrentMuApiContext())?.apiKey;

  const userData = await fetchUserData(apiKey);

  return (
    <AgentEditClient userData={userData} />
  );
}
