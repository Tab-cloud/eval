import type { Metadata } from "next";
import { Dashboard } from "../ui/Dashboard";

export const metadata: Metadata = {
  title: "用户控制台",
  description: "Eval Agent 用户、模型、权限与调用控制台。",
};

export default function ConsolePage() {
  return <Dashboard/>;
}
