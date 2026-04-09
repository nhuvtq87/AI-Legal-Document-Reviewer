/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Upload, 
  FileText, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  Loader2, 
  ShieldAlert,
  ArrowRight,
  Download,
  Scale
} from "lucide-react";
import mammoth from "mammoth";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { analyzeDocument, askQuestionAboutDocument, AnalysisResult, RiskItem } from "@/src/lib/gemini";
import { cn } from "@/lib/utils";
import { MessageSquare, Send } from "lucide-react";

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState("Preparing document...");
  
  // Q&A State
  const [docContext, setDocContext] = useState<{ data: string; mimeType: string } | null>(null);
  const [question, setQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "model"; parts: { text: string }[] }[]>([]);

  const loadingMessages = [
    "Ingesting legal clauses...",
    "Identifying potential red flags...",
    "Translating complex jargon...",
    "Assessing overall risk level...",
    "Finalizing executive summary...",
    "Generating action items..."
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setResult(null);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(",")[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const processDocx = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return btoa(unescape(encodeURIComponent(result.value)));
  };

  const startAnalysis = async () => {
    if (!file) return;

    setIsAnalyzing(true);
    setError(null);
    
    let messageIndex = 0;
    const messageInterval = setInterval(() => {
      setLoadingMessage(loadingMessages[messageIndex % loadingMessages.length]);
      messageIndex++;
    }, 3000);

    try {
      let base64Data = "";
      let mimeType = file.type;

      if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        // Docx needs special handling if we want to send it as text, 
        // but Gemini 3.1 Pro can handle PDF directly. 
        // For Docx, we'll convert to text first for better reliability.
        base64Data = await processDocx(file);
        mimeType = "text/plain";
      } else {
        base64Data = await fileToBase64(file);
      }

      const analysis = await analyzeDocument(base64Data, mimeType);
      setResult(analysis);
      setDocContext({ data: base64Data, mimeType });
    } catch (err) {
      console.error("Analysis error:", err);
      setError("An error occurred during analysis. Please ensure the file is a valid PDF, TXT, or Docx document.");
    } finally {
      clearInterval(messageInterval);
      setIsAnalyzing(false);
    }
  };

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !docContext || isAsking) return;

    const userQuestion = question.trim();
    setQuestion("");
    setIsAsking(true);

    const newUserMessage = { role: "user" as const, parts: [{ text: userQuestion }] };
    setChatHistory(prev => [...prev, newUserMessage]);

    try {
      const answer = await askQuestionAboutDocument(
        docContext.data,
        docContext.mimeType,
        userQuestion,
        chatHistory
      );
      setChatHistory(prev => [...prev, { role: "model" as const, parts: [{ text: answer }] }]);
    } catch (err) {
      console.error("Q&A error:", err);
      setChatHistory(prev => [...prev, { role: "model" as const, parts: [{ text: "I encountered an error while trying to answer your question. Please try again." }] }]);
    } finally {
      setIsAsking(false);
    }
  };

  const exportToCSV = () => {
    if (!result || !result.riskTable.length) return;

    const headers = ["Clause Name", "Risk Level", "The Jargon", "Plain English Meaning"];
    const rows = result.riskTable.map(item => [
      `"${item.clauseName.replace(/"/g, '""')}"`,
      `"${item.riskLevel.replace(/"/g, '""')}"`,
      `"${item.jargon.replace(/"/g, '""')}"`,
      `"${item.plainEnglish.replace(/"/g, '""')}"`
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `LexiAudit_Risk_Analysis_${new Date().getTime()}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getRiskBadge = (level: RiskItem["riskLevel"]) => {
    switch (level) {
      case "High":
        return <Badge variant="destructive" className="bg-red-600 text-white hover:bg-red-600">High Risk</Badge>;
      case "Med":
        return <Badge variant="secondary" className="bg-amber-500 text-white hover:bg-amber-600">Medium Risk</Badge>;
      case "Low":
        return <Badge variant="outline" className="text-emerald-600 text-white hover:border-emerald-600">Low Risk</Badge>;
      default:
        return <Badge variant="outline">{level}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-blue-100">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg">
              <Scale className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">LexiAudit AI</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:inline-block">Senior Legal Analyst System</span>
            <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider">v1.0.0-PRO</Badge>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Left Column: Upload & Controls */}
          <div className="lg:col-span-4 space-y-8">
            <div className="space-y-4">
              <h2 className="text-3xl font-bold tracking-tight">Contract Intelligence</h2>
              <p className="text-muted-foreground leading-relaxed">
                Upload your legal agreements for a high-precision audit. Our AI identifies unfriendly clauses and translates them into plain English.
              </p>
            </div>

            <Card className="border-2 border-dashed border-muted-foreground/20 bg-white/50 hover:border-blue-500/50 transition-colors">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                    <Upload className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium">Drop your document here</p>
                    <p className="text-xs text-muted-foreground">PDF, TXT, or DOCX up to 10MB</p>
                  </div>
                  <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    accept=".pdf,.txt,.docx"
                    onChange={handleFileChange}
                  />
                  <Button 
                    variant="outline" 
                    className="mt-6"
                    onClick={() => document.getElementById("file-upload")?.click()}
                  >
                    Select File
                  </Button>
                </div>
              </CardContent>
            </Card>

            {file && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between p-4 bg-white rounded-xl border shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-medium truncate max-w-[150px]">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
                <Button 
                  disabled={isAnalyzing}
                  onClick={startAnalysis}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing
                    </>
                  ) : (
                    <>
                      Audit Now
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </motion.div>
            )}

            <Alert variant="destructive" className="bg-red-50 border-red-100 text-red-900">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle className="text-xs font-bold uppercase tracking-wider">Legal Disclaimer</AlertTitle>
              <AlertDescription className="text-xs leading-relaxed opacity-80">
                This tool provides AI-generated analysis for informational purposes only. It does not constitute formal legal advice. Always consult with a qualified attorney before signing any legal document.
              </AlertDescription>
            </Alert>
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-8">
            <AnimatePresence mode="wait">
              {isAnalyzing ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full flex flex-col items-center justify-center py-20 space-y-6"
                >
                  <div className="relative">
                    <div className="w-20 h-20 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                    <Scale className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-blue-600" />
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-xl font-medium text-blue-600">{loadingMessage}</p>
                    <p className="text-sm text-muted-foreground">Our AI analyst is reviewing every clause for your protection.</p>
                  </div>
                </motion.div>
              ) : result ? (
                <motion.div
                  key="results"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-8"
                >
                  {/* Executive Summary */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      <h3 className="text-lg font-semibold">Executive Summary</h3>
                    </div>
                    <Card className="bg-white shadow-sm border-none ring-1 ring-black/5">
                      <CardContent className="pt-6">
                        <p className="text-lg leading-relaxed text-muted-foreground italic">
                          "{result.executiveSummary}"
                        </p>
                      </CardContent>
                    </Card>
                  </section>

                  {/* Risk Table */}
                  <section className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                        <h3 className="text-lg font-semibold">Risk Analysis Table</h3>
                      </div>
                      <Button variant="ghost" size="sm" className="text-xs" onClick={exportToCSV}>
                        <Download className="w-3 h-3 mr-2" />
                        Export CSV
                      </Button>
                    </div>
                    <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
                      <Table>
                        <TableHeader className="bg-muted/50">
                          <TableRow>
                            <TableHead className="w-[180px]">Clause Name</TableHead>
                            <TableHead className="w-[120px]">Risk Level</TableHead>
                            <TableHead>The Jargon</TableHead>
                            <TableHead>Plain English Meaning</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.riskTable.map((item, idx) => (
                            <TableRow key={idx} className="hover:bg-muted/30 transition-colors align-top">
                              <TableCell className="font-medium py-4">{item.clauseName}</TableCell>
                              <TableCell className="py-4">{getRiskBadge(item.riskLevel)}</TableCell>
                              <TableCell className="text-xs font-mono text-muted-foreground py-4 min-w-[250px] whitespace-pre-wrap">
                                {item.jargon}
                              </TableCell>
                              <TableCell className="text-sm leading-relaxed py-4 min-w-[300px] whitespace-pre-wrap">
                                {item.plainEnglish}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </section>

                  {/* Action Items */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Info className="w-5 h-5 text-blue-600" />
                      <h3 className="text-lg font-semibold">Recommended Action Items</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {result.actionItems.map((item, idx) => (
                        <Card key={idx} className="bg-blue-50/30 border-blue-100/50 hover:bg-blue-50/50 transition-colors">
                          <CardContent className="p-4 flex gap-3">
                            <div className="mt-1 w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                              <span className="text-[10px] font-bold text-blue-600">{idx + 1}</span>
                            </div>
                            <p className="text-sm font-medium text-blue-900/80">{item}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </section>

                  {/* Q&A Section */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-blue-600" />
                      <h3 className="text-lg font-semibold">Ask Questions About This Contract</h3>
                    </div>
                    <Card className="bg-white shadow-sm border-none ring-1 ring-black/5 overflow-hidden">
                      <CardContent className="p-0">
                        <ScrollArea className="h-[300px] p-4">
                          <div className="space-y-4">
                            {chatHistory.length === 0 && (
                              <div className="text-center py-10 text-muted-foreground">
                                <p className="text-sm italic">"What is the termination notice period?"</p>
                                <p className="text-sm italic">"Are there any hidden fees mentioned?"</p>
                                <p className="text-xs mt-2">Ask anything about the document above.</p>
                              </div>
                            )}
                            {chatHistory.map((msg, idx) => (
                              <div 
                                key={idx} 
                                className={cn(
                                  "flex flex-col max-w-[85%] rounded-2xl p-3 text-sm",
                                  msg.role === "user" 
                                    ? "ml-auto bg-blue-600 text-white rounded-tr-none" 
                                    : "mr-auto bg-muted text-foreground rounded-tl-none"
                                )}
                              >
                                <p className="leading-relaxed">{msg.parts[0].text}</p>
                              </div>
                            ))}
                            {isAsking && (
                              <div className="mr-auto bg-muted text-foreground rounded-2xl rounded-tl-none p-3 max-w-[85%]">
                                <Loader2 className="w-4 h-4 animate-spin" />
                              </div>
                            )}
                          </div>
                        </ScrollArea>
                        <Separator />
                        <form onSubmit={handleAskQuestion} className="p-4 flex gap-2">
                          <input
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            placeholder="Type your question here..."
                            className="flex-1 bg-muted/50 border-none rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            disabled={isAsking}
                          />
                          <Button 
                            type="submit" 
                            size="icon" 
                            disabled={isAsking || !question.trim()}
                            className="bg-blue-600 hover:bg-blue-700 shrink-0"
                          >
                            <Send className="w-4 h-4" />
                          </Button>
                        </form>
                      </CardContent>
                    </Card>
                  </section>
                </motion.div>
              ) : error ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-full flex flex-col items-center justify-center py-20 text-center space-y-4"
                >
                  <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
                    <AlertTriangle className="w-8 h-8 text-red-600" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-lg font-semibold text-red-900">Analysis Failed</p>
                    <p className="text-muted-foreground max-w-md">{error}</p>
                  </div>
                  <Button variant="outline" onClick={() => setError(null)}>Try Again</Button>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-full flex flex-col items-center justify-center py-20 text-center space-y-6 border-2 border-dashed rounded-3xl bg-muted/20"
                >
                  <div className="w-20 h-20 rounded-full bg-white shadow-sm flex items-center justify-center">
                    <Scale className="w-10 h-10 text-muted-foreground/40" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold text-muted-foreground">Awaiting Document</h3>
                    <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                      Upload a legal contract on the left to begin your automated risk assessment.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © 2026 LexiAudit AI. Powered by Google Gemini 3.1 Pro.
          </p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-xs text-muted-foreground hover:text-blue-600 transition-colors">Privacy Policy</a>
            <a href="#" className="text-xs text-muted-foreground hover:text-blue-600 transition-colors">Terms of Service</a>
            <a href="#" className="text-xs text-muted-foreground hover:text-blue-600 transition-colors">Contact Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
