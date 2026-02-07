"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { API_URL } from "@/lib/config";
import { CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1); // 1: Connect, 2: Select Repo, 3: Analyze, 4: Pipeline Config

  const [form, setForm] = useState({
    name: "",
    githubRepo: "",
    githubToken: "",
  });

  const [repos, setRepos] = useState<any[]>([]);
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  // Load token and step from URL or localStorage
  useEffect(() => {
    const urlStep = searchParams.get("step");
    if (urlStep) setStep(parseInt(urlStep));

    const token =
      searchParams.get("token") || localStorage.getItem("github_token") || form.githubToken;
    if (token) {
      setForm((prev) => ({ ...prev, githubToken: token }));
      localStorage.setItem("github_token", token);
      fetchRepos(token);

      // If we have a token and we are on step 1, move to step 2 automatically
      if (step === 1 && !urlStep) setStep(2);
    }
  }, [searchParams]);

  const fetchRepos = async (token: string) => {
    try {
      const res = await fetch(`${API_URL}/api/onboarding/repos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubToken: token }),
      });
      const data = await res.json();
      if (data.repos) setRepos(data.repos);
    } catch (e) {
      console.error("Failed to fetch repos", e);
    }
  };

  const handleOAuth = () => {
    window.location.href = `${API_URL}/api/auth/github?redirect=/onboarding`;
  };

  const handleAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep(3); // Show "Analyzing..." UI

    try {
      const res = await fetch(`${API_URL}/api/onboarding/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      setAnalysisResult(data.result);

      // Move to Step 4 (Full Page Pipeline Config)
      setTimeout(() => setStep(4), 1500);
    } catch (err) {
      console.error("Analysis failed", err);
      // Fallback
      await connectProject();
    }
  };

  // Pipeline Config State
  const [pipelineStep, setPipelineStep] = useState<"SELECTION" | "ENV_VARS">("SELECTION");
  const [envVars, setEnvVars] = useState<{ key: string; value: string }[]>([
    { key: "", value: "" },
  ]);
  const [selectedPipelineType, setSelectedPipelineType] = useState<string>("");

  const startPipelineCreation = (type: string) => {
    setSelectedPipelineType(type);
    setPipelineStep("ENV_VARS");
  };

  const addEnvVar = () => {
    setEnvVars([...envVars, { key: "", value: "" }]);
  };

  const handleEnvChange = (index: number, field: "key" | "value", val: string) => {
    const newEnvs = [...envVars];
    newEnvs[index][field] = val;
    setEnvVars(newEnvs);
  };

  const submitPipeline = async (skipEnv: boolean = false) => {
    const finalEnvs = skipEnv
      ? {}
      : envVars.reduce((acc: any, curr) => {
          if (curr.key) acc[curr.key] = curr.value;
          return acc;
        }, {});

    try {
      const res = await fetch(`${API_URL}/api/onboarding/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          type: selectedPipelineType,
          stack: analysisResult?.suggestedStack || "node", // Use detected stack
          env: finalEnvs,
        }),
      });

      const data = await res.json();
      if (res.ok && data.result.success) {
        toast.success("Success! Pipeline created.");
        await connectProject();
      } else {
        toast.error("Failed: " + (data.error || "Unknown"));
      }
    } catch (err: any) {
      toast.error("Error: " + err.message);
    }
  };

  const connectProject = async () => {
    try {
      const res = await fetch(`${API_URL}/api/onboarding/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (res.ok) {
        router.push("/dashboard");
      } else {
        toast.error("Error: " + data.error);
        setStep(2);
      }
    } catch (err: any) {
      toast.error("Failed to connect: " + err.message);
      setStep(2);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="w-full max-w-2xl relative z-10">
        {" "}
        {/* Increased width for Step 4 */}
        <div className="bg-zinc-950 border border-zinc-800 p-8 rounded-xl shadow-sm">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-semibold text-white tracking-tight">
              {step === 1 && "Connect GitHub"}
              {step === 2 && "Configure Project"}
              {step === 3 && "Analyzing Repository"}
              {step === 4 && "Pipeline Setup"}
            </h1>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`h-1.5 w-8 rounded-full transition-colors ${step >= i ? "bg-white" : "bg-zinc-800"}`}
                />
              ))}
            </div>
          </div>

          {/* Step 1: Connect */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <p className="text-zinc-400 text-sm leading-relaxed">
                Connect your GitHub account to import your repositories and enable automated
                pipeline management.
              </p>
              <div className="pt-2 space-y-4">
                <button
                  type="button"
                  onClick={handleOAuth}
                  className="w-full flex items-center justify-center gap-2 bg-white hover:bg-gray-100 text-black font-medium py-2.5 rounded-md transition-all border border-transparent text-sm"
                >
                  Connect with GitHub
                </button>

                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-zinc-800"></div>
                  <span className="flex-shrink-0 mx-4 text-zinc-600 text-[10px] uppercase tracking-wider">
                    OR
                  </span>
                  <div className="flex-grow border-t border-zinc-800"></div>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setStep(2);
                    fetchRepos(form.githubToken);
                  }}
                  className="space-y-4"
                >
                  <input
                    type="password"
                    required
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-white transition-all text-sm text-zinc-300 placeholder:text-zinc-600"
                    placeholder="Personal Access Token (ghp_...)"
                    value={form.githubToken}
                    onChange={(e) => setForm({ ...form, githubToken: e.target.value })}
                  />
                  <button
                    type="submit"
                    disabled={!form.githubToken}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-2.5 rounded-md transition-all text-sm disabled:opacity-50"
                  >
                    Continue with Token
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Step 2: Select Repo */}
          {step === 2 && (
            <form
              onSubmit={handleAnalysis}
              className="space-y-6 animate-in slide-in-from-right fade-in duration-300"
            >
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400">Repository</label>
                <Select
                  required
                  value={form.githubRepo}
                  onValueChange={(value: string) => {
                    setForm((prev) => ({
                      ...prev,
                      githubRepo: value,
                      name: prev.name || value.split("/")[1] || "",
                    }));
                  }}
                >
                  <SelectTrigger className="w-full bg-zinc-900 border-zinc-800 text-zinc-300 h-11 focus:ring-1 focus:ring-white">
                    <SelectValue placeholder="Select a repository..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-950 border-zinc-800 text-zinc-300">
                    {repos.map((repo) => (
                      <SelectItem
                        key={repo.id}
                        value={repo.full_name}
                        className="focus:bg-zinc-900 focus:text-white cursor-pointer"
                      >
                        {repo.full_name}{" "}
                        <span className="text-zinc-600 ml-2 text-xs">({repo.visibility})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400">Project Name</label>
                <input
                  type="text"
                  required
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-white transition-all text-sm text-zinc-300"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <button
                type="submit"
                className="w-full bg-white hover:bg-gray-200 text-black font-medium py-2.5 rounded-md transition-all text-sm mt-2"
              >
                Analyze Project
              </button>
            </form>
          )}

          {/* Step 3: Analyzing */}
          {step === 3 && (
            <div className="flex flex-col items-center justify-center py-12 animate-in fade-in duration-500">
              <div className="w-12 h-12 border-2 border-zinc-800 border-t-white rounded-full animate-spin mb-6"></div>
              <p className="text-lg font-medium text-zinc-200">Analyzing Repository...</p>
              <p className="text-sm text-zinc-500 mt-2 text-center max-w-sm">
                We are scanning your codebase to detect frameworks, infrastructure code, and
                existing CI/CD pipelines.
              </p>
            </div>
          )}

          {/* Step 4: Pipeline Configuration (Refactored from Dialog) */}
          {step === 4 && (
            <div className="space-y-6 animate-in slide-in-from-right fade-in duration-300">
              {/* Analysis Status Banner */}
              <div
                className={`p-4 rounded-lg border ${
                  analysisResult?.status === "EXISTS"
                    ? "bg-green-500/10 border-green-500/20"
                    : "bg-amber-500/10 border-amber-500/20"
                }`}
              >
                <div className="flex items-start gap-3">
                  {analysisResult?.status === "EXISTS" ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
                  )}
                  <div>
                    <h4
                      className={`text-sm font-medium ${analysisResult?.status === "EXISTS" ? "text-green-400" : "text-amber-400"}`}
                    >
                      {analysisResult?.status === "EXISTS"
                        ? "Pipeline Detected"
                        : "No Pipeline Found"}
                    </h4>
                    <p className="text-xs text-zinc-400 mt-1">
                      {analysisResult?.status === "EXISTS"
                        ? `We found a ${analysisResult.type} configuration at ${analysisResult.file}.`
                        : `We detected a ${analysisResult?.suggestedStack} project, but no CI/CD configuration.`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Pipeline Selection */}
              {analysisResult?.status === "MISSING" && pipelineStep === "SELECTION" && (
                <div className="space-y-4">
                  <p className="text-sm text-zinc-400">Choose a pipeline template to generate:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                      onClick={() => startPipelineCreation("github-actions")}
                      className="p-4 border border-zinc-800 rounded-lg hover:bg-zinc-900 transition-all text-left bg-zinc-950/50 group"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        {/* GitHub Icon */}
                        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                        </svg>
                        <span className="font-semibold text-white group-hover:underline">
                          GitHub Actions
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500">
                        Auto-generates main.yml for build & test. Best for GitHub hosted projects.
                      </p>
                    </button>

                    <button
                      onClick={() => startPipelineCreation("jenkins")}
                      className="p-4 border border-zinc-800 rounded-lg hover:bg-zinc-900 transition-all text-left bg-zinc-950/50 group"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        {/* Jenkins Icon */}
                        <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M16.96 14.97c-.24-2.85-2.2-4.14-3.66-4.66.1-.73.34-2.1.34-2.1s1.39.29 2.09.4c.59.09.43-.9.43-.9s-1.59-.26-2.5-.32c-.08-.73-.24-1.78-.34-2.61l.93-.2c.4-.09.28-.76.28-.76l-1.02.21c-.13-1.06-.32-2.73-.32-2.73s-.84-.13-1.08.7c-.12.43-.37 2.1-.48 3.14-.38.07-.76.16-1.12.26-.06-.51-.13-1.01-.21-1.5-.09-.54-.84-.46-.88.16l.24 1.4c-.4.12-.8.25-1.19.4-.04-.5-.09-1.01-.15-1.5-.1-.76-.87-.6-.89.1l.19 1.54c-1.55.57-2.9 1.14-2.9 1.14s.1 1.04.88.94c.53-.06 1.77-.51 3.25-1.01-.06.77-.1 1.63-.09 2.37-1.13-.04-2.53.07-2.53.07s.05.99.85.91c.54-.05 1.83-.24 2.87-.15-.05.51-.08.97-.09 1.37-1.37.28-2.68.86-2.68.86s.2 1.01.95.83c.63-.16 2.02-.68 3.42-1.05v.2c0 .48 0 .97.04 1.48-.96.65-2.02 1.63-2.02 1.63s.47.6.93.38c.63-.29 1.45-1.03 2.19-1.76.22 1.4.67 3.51.67 3.51s.88-.13.91-.98c.02-.59-.09-2.22-.3-3.6.4-.1.82-.19 1.25-.26.54 2.65 1.57 6.01 3.65 8.79.82 1.1 2.22-.09 1.34-1.12-1.89-2.2-2.76-4.9-3.23-7.22 1.56.34 3.03 1.2 3.03 1.2s.59-.83-.16-1.15zM12 2C6.47 2 2 6.48 2 12s4.47 10 10 10 10-4.48 10-10S17.53 2 12 2z" />
                        </svg>
                        <span className="font-semibold text-white group-hover:underline">
                          Jenkins
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500">
                        Creates a Jenkinsfile. Perfect for self-hosted Jenkins pipelines.
                      </p>
                    </button>
                  </div>
                </div>
              )}

              {/* Env Vars Config */}
              {pipelineStep === "ENV_VARS" && (
                <div className="border border-zinc-800 rounded-lg p-6 bg-zinc-900/30">
                  <h3 className="text-sm font-semibold text-white mb-1">Environment Variables</h3>
                  <p className="text-xs text-zinc-500 mb-4">
                    Add secrets like API keys or Database URLs needed for the build.
                  </p>

                  <div className="space-y-3">
                    {envVars.map((env, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          placeholder="KEY (e.g. DATABASE_URL)"
                          className="bg-zinc-950 border-zinc-800 text-xs h-9 font-mono"
                          value={env.key}
                          onChange={(e) => handleEnvChange(i, "key", e.target.value)}
                        />
                        <Input
                          placeholder="VALUE"
                          type="password"
                          className="bg-zinc-950 border-zinc-800 text-xs h-9 font-mono"
                          value={env.value}
                          onChange={(e) => handleEnvChange(i, "value", e.target.value)}
                        />
                      </div>
                    ))}
                    <button
                      onClick={addEnvVar}
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium mt-1"
                    >
                      + Add Variable
                    </button>
                  </div>

                  <div className="flex justify-end gap-3 mt-8">
                    <button
                      onClick={() => submitPipeline(true)}
                      className="text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      Skip Validation
                    </button>
                    <button
                      onClick={() => submitPipeline(false)}
                      className="bg-white text-black text-sm font-semibold px-4 py-2 rounded hover:bg-gray-200 transition-colors flex items-center gap-2"
                    >
                      Create Pipeline & PR <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Footer Actions (Only show if not in Envs mode or if nothing to do) */}
              {analysisResult?.status === "EXISTS" && (
                <div className="flex justify-end">
                  <button
                    onClick={() => connectProject()}
                    className="bg-white text-black font-medium py-2.5 px-6 rounded-md hover:bg-gray-200 transition-colors text-sm"
                  >
                    Finish & Go to Dashboard
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
