/* eslint-disable @next/next/no-img-element -- isolated browser fixture, not the Next image optimizer */
import type { ImgHTMLAttributes } from "react";
export default function Image(props: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) {
  const attrs = Object.fromEntries(Object.entries(props).filter(([key]) => key !== "fill" && key !== "priority"));
  return <img {...attrs} alt={props.alt ?? ""} style={props.fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...props.style } : props.style} />;
}
