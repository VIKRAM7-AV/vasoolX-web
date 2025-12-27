"use client";

import React, { useState, FC, useEffect } from "react";
import { KeyRound, UserRound, Eye, EyeOff } from "lucide-react";
import api from "@/api/api";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import Image from "next/image";

type LoginProps = {
  setAuth?: (state: string) => void;
};

const Login: FC<LoginProps> = ({ setAuth = () => {} }) => {
  const [user, setUser] = useState({ name: "", password: "" }); // Changed 'name' to 'username' to match backend if needed
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // 1. Check for existing session immediately
  useEffect(() => {
    const token = Cookies.get("access_token");
    if (token) {
      router.replace('/admin'); // Use replace to prevent going back to login
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user.name || !user.password) {
      setError("Please fill in all fields.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      // payload must match backend expectation (Controller expects "username", state has "name")
      const payload = {
        username: user.name, 
        password: user.password
      };

      const response = await api.post('/admin/login', payload);

      if (response.status === 200) {
        const { accessTokenAdmin, refreshTokenAdmin, admin } = response.data;
        
        // 2. Set Cookies Correctly
        // secure: true only works on HTTPS. We check environment.
        const isProduction = process.env.NODE_ENV === 'production';

        Cookies.set("access_token", accessTokenAdmin, { 
            expires: 1, 
            secure: isProduction, // False on localhost, True on Vercel/Prod
            sameSite: 'strict' 
        });
        
        Cookies.set("refresh_token", refreshTokenAdmin, { 
            expires: 7, 
            secure: isProduction, 
            sameSite: 'strict' 
        });
        
        localStorage.setItem("admin_data", JSON.stringify(admin));

        setAuth("logged_in");
        toast.success("Login successful!");
        
        // 3. Redirect
        router.push("/admin");
      }
    } catch (error: any) {
      console.error('Login error:', error);
      let errorMessage = "Login failed. Please try again.";
      
      if (error.code === "ERR_NETWORK") {
        errorMessage = "Cannot connect to server. Check your internet or if backend is running.";
      } else if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      }
      
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // ... rest of your UI code (Theme, JSX) remains exactly the same ...
  // --- UPDATED THEME: Black & Yellow-700 ---
  const theme = {
    primary: "#CA8A04",      
    primaryHighlight: "#EAB308",
    pageBackground: "#fff",   
    glassBackground: "rgba(255, 255, 255, 0.03)", 
    glassBorder: "rgba(255, 255, 255, 0.08)",
    textPrimary: "#FFFFFF",
    textSecondary: "#9CA3AF",
    inputBg: "rgba(0, 0, 0, 0.4)", 
    inputBorder: "rgba(255, 255, 255, 0.1)",
  };

  return (
    <div 
      className="relative min-h-screen flex items-center justify-center p-4 lg:p-8 font-sans overflow-hidden"
      style={{ backgroundColor: '#ffffff' }}
    >
      <div className="relative w-full max-w-5xl flex flex-col lg:flex-row rounded-3xl shadow-2xl overflow-hidden min-h-150">
        
        {/* Left Side: Brand Panel */}
        <div className="w-full lg:w-5/12 relative flex flex-col items-center justify-center p-12 text-center overflow-hidden bg-black">
           <div className="absolute inset-0 opacity-10" 
                style={{ backgroundImage: `radial-gradient(#333 1px, transparent 1px)`, backgroundSize: '20px 20px' }}>
           </div>
          <div className="relative z-10 flex flex-col items-center">
            <div className=" w-32 h-32 relative">
                {/* Ensure this path is correct in your public folder */}
                <Image src="/icon.png" alt="VasoolX Logo" fill className="object-contain" /> 
            </div>
            <h1 className="text-5xl font-extrabold tracking-tight mb-4">
              <span style={{ color: theme.primary }}>VasoolX</span>
            </h1>
            <p className="text-gray-700 text-lg font-medium leading-relaxed max-w-xs mx-auto">
              Seamless Finance & Payment<br/>Tracking Solution
            </p>
          </div>
          <div className="absolute bottom-6 text-gray-600 text-xs tracking-widest uppercase font-bold">
            Admin Portal • v1.0
          </div>
        </div>

        {/* Right Side: Login Form */}
        <div 
            className="w-full lg:w-7/12 flex flex-col items-center justify-center p-8 lg:p-16 relative backdrop-blur-xl"
            style={{ 
                backgroundColor: theme.glassBackground,
                borderLeft: `1px solid ${theme.glassBorder}`
            }}
        >
          <div className="w-full max-w-md relative z-10">
            <div className="mb-10 text-center lg:text-left">
              <h2 className="text-3xl font-bold mb-2 text-black">Welcome Back</h2>
              <p className="text-base text-gray-700">Enter your credentials to access the dashboard.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-1">
                <label className="text-sm font-medium ml-1 text-gray-600">Username</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                    <UserRound className="h-5 w-5 text-gray-500 group-focus-within:text-yellow-600 transition-colors" />
                  </div>
                  <input
                    type="text"
                    placeholder="Enter your username"
                    required
                    value={user.name}
                    onChange={(e) => setUser({ ...user, name: e.target.value })}
                    className="block w-full pl-12 pr-4 py-4 border rounded-xl focus:outline-none transition-all duration-200 font-medium placeholder-gray-600 text-white"
                    style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = theme.primary; e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.6)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = theme.inputBorder; e.currentTarget.style.backgroundColor = theme.inputBg; }}
                  />
                </div>
              </div>

              <div className="space-y-1">
                 <label className="text-sm font-medium ml-1 text-gray-600">Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                    <KeyRound className="h-5 w-5 text-gray-500 group-focus-within:text-yellow-600 transition-colors" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    required
                    value={user.password}
                    onChange={(e) => setUser({ ...user, password: e.target.value })}
                    className="block w-full pl-12 pr-12 py-4 border rounded-xl focus:outline-none transition-all duration-200 font-medium placeholder-gray-600 text-white"
                    style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = theme.primary; e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.6)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = theme.inputBorder; e.currentTarget.style.backgroundColor = theme.inputBg; }}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-gray-300 transition-colors cursor-pointer z-20">
                    {showPassword ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-900/20 border border-red-900/50 flex items-center justify-center backdrop-blur-sm">
                  <p className="text-sm font-medium text-red-400">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{ background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primary} 100%)`, color: '#FFFFFF' }}
                className="w-full font-medium py-4 px-6 rounded-xl shadow-lg hover:shadow-yellow-600/20 hover:scale-[1.01] active:scale-[0.99] focus:outline-none transition-all duration-300 text-lg flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? "Signing In..." : "Sign In to Dashboard"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;