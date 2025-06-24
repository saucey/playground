import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import Link from "next/link";

export default function WelcomePage() {
  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-background">
      <div className="absolute top-4 right-4">
        <ModeToggle />
      </div>
      
      <div className="flex flex-col items-center justify-center space-y-8 text-center px-4">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          Welcome to Our Site !
        </h1>
        
        <p className="max-w-prose text-lg text-muted-foreground">
          Discover amazing content and features tailored just for you.
        </p>
        
        <div className="flex gap-4">
          <Button asChild size="lg">
            <Link href="/home">Enter Site</Link>
          </Button>
          
          <Button variant="outline" size="lg" asChild>
            <Link href="/about">Learn More</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}