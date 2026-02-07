import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { UploadCloud, X, Loader2 } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { API_URL } from "@/lib/config";

interface ReportIncidentDialogProps {
  projectId: string;
}

export function ReportIncidentDialog({ projectId }: ReportIncidentDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<string | null>(null);

  // Handle Drag & Drop
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImage(e.target?.result as string); // Base64 string
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".webp"],
    },
    maxFiles: 1,
  });

  const handleSubmit = async () => {
    if (!title || !description) {
      toast.error("Please provide a title and description.");
      return;
    }

    setLoading(true);
    try {
      const payload: any = {
        projectId,
        title,
        description,
        source: "MANUAL_REPORT",
        severity: "CRITICAL",
        metadata: {
          logSource: "manual_upload",
        },
      };

      if (image) {
        payload.metadata.images = [image]; // Send base64 image
      }

      const res = await fetch(`${API_URL}/api/v1/logs/${projectId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Assuming development mode or token handling on backend
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to report incident");

      if (!res.ok) throw new Error("Failed to report incident");

      toast.success(
        image
          ? "Screenshot received. AI SRE initializing analysis..."
          : "Incident reported. AI SRE initializing analysis...",
      );
      setOpen(false);
      resetForm();
    } catch (error) {
      console.error(error);
      toast.error("Failed to submit report.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setImage(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" className="bg-red-600 hover:bg-red-700">
          Report Incident
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-zinc-950 border-zinc-800 text-white">
        <DialogHeader>
          <DialogTitle>Report an Incident</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Describe the issue and attach a screenshot. Our AI SRE will analyze it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Checkout page is stuck loading"
              className="bg-zinc-900 border-zinc-800"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="desc">Description</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what happened..."
              className="bg-zinc-900 border-zinc-800 min-h-[100px]"
            />
          </div>

          {/* Drag & Drop Zone */}
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer transition-colors
              ${isDragActive ? "border-purple-500 bg-purple-500/10" : "border-zinc-700 hover:border-zinc-500"}
            `}
          >
            <input {...getInputProps()} />
            {image ? (
              <div className="relative w-full">
                <img
                  src={image}
                  alt="Preview"
                  className="max-h-48 rounded mx-auto object-contain border border-zinc-700"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute -top-2 -right-2 bg-zinc-900 text-red-500 rounded-full hover:bg-zinc-800 border border-zinc-700 h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    setImage(null);
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="text-center text-zinc-500">
                <UploadCloud className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">Click to upload screenshot</p>
                <p className="text-xs mt-1">or drag and drop here</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={loading}
            className="bg-transparent border-zinc-700 text-white hover:bg-zinc-800 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Launch AI Investigation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
