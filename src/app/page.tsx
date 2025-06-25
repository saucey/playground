"use client";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { RocketIcon, InfoCircledIcon } from "@radix-ui/react-icons";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function WelcomePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold text-gray-900">
              Welcome to Our Platform
            </CardTitle>
            <CardDescription className="mt-2 text-gray-600">
              Get started with your journey today
            </CardDescription>
          </CardHeader>
          
          <CardContent className="flex flex-col space-y-4">
            <div className="flex items-center justify-center py-4">
              <RocketIcon className="h-16 w-16 text-primary" />
            </div>
            
            <p className="text-center text-gray-700">
              Discover amazing features and tools that will help you achieve your goals faster and more efficiently.
            </p>
          </CardContent>
          
          <CardFooter className="flex flex-col space-y-3">
            <Button 
              onClick={() => router.push("/dashboard")}
              className="w-full"
              size="lg"
            >
              Enter Dashboard
            </Button>
            
            <Button 
              onClick={() => router.push("/about")}
              variant="outline"
              className="w-full"
              size="lg"
            >
              <InfoCircledIcon className="mr-2 h-4 w-4" />
              Learn More
            </Button>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}