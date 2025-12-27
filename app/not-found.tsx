"use client";
import React, { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function NotFound() {
  useEffect(() => {
    
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#ffffff] p-4 sm:p-6 text-[#1A1A1A] gap-6 sm:gap-8">
      {/* Image Column */}
      <div className="flex items-center justify-center order-1 w-full max-w-lg sm:max-w-2xl">
        <Image
          src="/404.svg"
          alt="404 Not Found Illustration"
          width={1200}
          height={1200}
          className="w-full h-auto max-h-100 sm:max-h-150 object-contain"
        />
      </div>
     
      {/* Text Column */}
      <div className="flex flex-col items-center justify-center order-2 text-center max-w-md sm:max-w-lg md:mt-6 sm:mt-10">
        <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4 text-[#1A1A1A]">Oops! Page Not Found</h1>
        <p className="text-[#545454] mb-4 sm:mb-6 leading-relaxed text-sm sm:text-base">
          The page you&#39;re looking for doesn&#39;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-block bg-[#AC7C2D] text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg hover:bg-[#8A6324] transition-colors duration-200 font-medium text-sm sm:text-base"
        >
          Go Back Login
        </Link>
      </div>
      <div className="absolute -right-24 sm:-right-48 text-sm text-[#dcdbdb] rotate-90 hidden lg:block">
        <h1 className='font-extrabold text-[200px] sm:text-[350px]'>404</h1>
      </div>
    </div>
  );
}