import type { Metadata } from "next";
import { AgentLanding } from "./agent/AgentLanding";
import "./agent/landing.css";

export const metadata: Metadata = {
  title: "Eval Agent — 嵌入式研发智能体",
  description: "从原理图、固件到真实硬件调试，一套可编排、可恢复、可治理的嵌入式研发 Agent 系统。",
};

export default function Home() {
  return <AgentLanding />;
}
