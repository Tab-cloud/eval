import type { Metadata } from "next";
import { Dashboard } from "./ui/Dashboard";

export const metadata: Metadata = {
  title: "Luban AI Console",
  description: "统一、安全、可观测的企业级 AI 模型网关。",
};

export default function Home() {
  return <Dashboard />;
}
