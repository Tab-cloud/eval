import { proxyGateway } from "../../../gateway/proxy";

export async function POST(request: Request) {
  return proxyGateway(request, "responses");
}
