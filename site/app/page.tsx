import Canvas from "@/components/Canvas";
import { AudioProvider } from "./AudioProvider";
import Intro from "./Intro";

export default function Page() {
  return (
    <AudioProvider src="/media/i-found-her.mp3">
      <Intro />
      <Canvas />
    </AudioProvider>
  );
}
