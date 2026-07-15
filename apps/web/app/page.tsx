import { Agents } from "@/components/site/agents";
import { Footer } from "@/components/site/footer";
import { Hero } from "@/components/site/hero";
import { Nav } from "@/components/site/nav";
import { Pricing } from "@/components/site/pricing";
import { Problem } from "@/components/site/problem";
import { RecentPacks } from "@/components/site/recent-packs";
import { Seal } from "@/components/site/seal";
import { Studios } from "@/components/site/studios";
import { Tribunal } from "@/components/site/tribunal";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <RecentPacks />
        <Problem />
        <Studios />
        <Tribunal />
        <Seal />
        <Pricing />
        <Agents />
      </main>
      <Footer />
    </>
  );
}
