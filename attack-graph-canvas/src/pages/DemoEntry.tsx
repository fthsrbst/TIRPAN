import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { setDemoMode } from "@/lib/demoMode";

export default function DemoEntry() {
  const navigate = useNavigate();

  useEffect(() => {
    setDemoMode();
    navigate("/", { replace: true });
  }, [navigate]);

  return (
    <div
      style={{
        background: "#000",
        color: "#ccff00",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "14px",
        gap: "12px",
      }}
    >
      <div style={{ fontSize: "32px" }}>◣</div>
      <div>TIRPAN — Loading demo...</div>
      <div style={{ color: "#444", fontSize: "11px" }}>Initializing mock session data</div>
    </div>
  );
}
