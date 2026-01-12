"use client";

import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import { FileRejection, useDropzone } from "react-dropzone";
import { useCallback, useState, useEffect } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { Loader2, Trash2, Upload } from "lucide-react";

export function Uploader() {
  const [files, setFiles] = useState<
    Array<{
      id: string;
      file: File;
      uploading: boolean;
      progress: number;
      key?: string;
      isDeleting: boolean;
      error: boolean;
      objectUrl?: string;
    }>
  >([]);

  async function removeFile(fileId: string) {
    try {
      const fileToRemove = files.find((f) => f.id === fileId);
      if (fileToRemove) {
        if (fileToRemove.objectUrl) {
          URL.revokeObjectURL(fileToRemove.objectUrl);
        }
      }

      setFiles((prevFiles) =>
        prevFiles.map((f) => (f.id === fileId ? { ...f, isDeleting: true } : f))
      );

      const response = await fetch("/api/s3/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: fileToRemove?.key }),
      });

      if (!response.ok) {
        toast.error("Failed to remove file from storage.");
        setFiles((prevFiles) =>
          prevFiles.map((f) =>
            f.id === fileId ? { ...f, isDeleting: false, error: true } : f
          )
        );
        return;
      }

      setFiles((prevFiles) => prevFiles.filter((f) => f.id !== fileId));
      toast.success("File removed successfully");
    } catch (error) {
      toast.error("Failed to remove file from storage.");
      setFiles((prevFiles) =>
        prevFiles.map((f) =>
          f.id === fileId ? { ...f, isDeleting: false, error: true } : f
        )
      );
    }
  }

  const uploadFile = async (file: File) => {
    setFiles((prevFiles) =>
      prevFiles.map((f) => (f.file === file ? { ...f, uploading: true } : f))
    );

    try {
      // 1. Get presigned URL
      const presignedResponse = await fetch("/api/s3/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });

      if (!presignedResponse.ok) {
        toast.error("Failed to get presigned URL");

        setFiles((prevFiles) =>
          prevFiles.map((f) =>
            f.file === file
              ? { ...f, uploading: false, progress: 0, error: true }
              : f
          )
        );

        return;
      }

      const { presignedUrl, key } = await presignedResponse.json();

      // 2. Upload file to S3

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = (event.loaded / event.total) * 100;
            setFiles((prevFiles) =>
              prevFiles.map((f) =>
                f.file === file
                  ? { ...f, progress: Math.round(percentComplete), key: key }
                  : f
              )
            );
          }
        };

        xhr.onload = () => {
          if (xhr.status === 200 || xhr.status === 204) {
            // 3. File fully uploaded - set progress to 100
            setFiles((prevFiles) =>
              prevFiles.map((f) =>
                f.file === file
                  ? { ...f, progress: 100, uploading: false, error: false }
                  : f
              )
            );

            toast.success("File uploaded successfully");

            resolve();
          } else {
            reject(new Error(`Upload failed with status: ${xhr.status}`));
          }
        };

        xhr.onerror = () => {
          reject(new Error("Upload failed"));
        };

        xhr.open("PUT", presignedUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      });
    } catch {
      toast.error("Something went wrong");

      setFiles((prevFiles) =>
        prevFiles.map((f) =>
          f.file === file
            ? { ...f, uploading: false, progress: 0, error: true }
            : f
        )
      );
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length) {
      setFiles((prevFiles) => [
        ...prevFiles,
        ...acceptedFiles.map((file) => ({
          id: uuidv4(),
          file,
          uploading: false,
          progress: 0,
          isDeleting: false,
          error: false,
          objectUrl: URL.createObjectURL(file),
        })),
      ]);

      acceptedFiles.forEach(uploadFile);
    }
  }, []);

  const rejectedFiles = useCallback((fileRejection: FileRejection[]) => {
    if (fileRejection.length) {
      const toomanyFiles = fileRejection.find(
        (rejection) => rejection.errors[0].code === "too-many-files"
      );

      const fileSizetoBig = fileRejection.find(
        (rejection) => rejection.errors[0].code === "file-too-large"
      );

      if (toomanyFiles) {
        toast.error("Zu viele Dateien ausgewählt, maximal 50 erlaubt");
      }

      if (fileSizetoBig) {
        toast.error("Dateigröße überschreitet das 100MB-Limit");
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected: rejectedFiles,
    maxFiles: 50,
    maxSize: 1024 * 1024 * 100,
    accept: {
      "image/*": [],
    },
  });

  useEffect(() => {
    return () => {
      // Cleanup object URLs when component unmounts
      files.forEach((file) => {
        if (file.objectUrl) {
          +URL.revokeObjectURL(file.objectUrl);
        }
      });
    };
  }, [files]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dateien hochladen</CardTitle>
        <CardDescription>
          Ziehe Bilder hierher oder klicke, um Dateien auszuwählen
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          {...getRootProps()}
          className={cn(
            "relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 sm:p-12 transition-colors",
            isDragActive
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-accent/50"
          )}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-3 sm:gap-4 text-center">
            <div
              className={cn(
                "rounded-full bg-muted p-3 sm:p-4",
                isDragActive && "bg-primary/10"
              )}
            >
              <Upload
                className={cn(
                  "size-6 sm:size-8",
                  isDragActive ? "text-primary" : "text-muted-foreground"
                )}
              />
            </div>
            <div className="space-y-1 px-4">
              <p className="text-xs sm:text-sm font-medium">
                {isDragActive
                  ? "Dateien hier ablegen"
                  : "Dateien hier ablegen oder klicken zum Auswählen"}
              </p>
              <p className="text-xs text-muted-foreground">
                Bilder bis zu 100MB
              </p>
            </div>
          </div>
        </div>

        {files.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {files.map(
              ({
                id,
                file,
                uploading,
                progress,
                isDeleting,
                error,
                objectUrl,
              }) => {
                return (
                  <div key={id} className="flex flex-col gap-1">
                    <div className="relative aspect-square rounded-lg overflow-hidden">
                      <img
                        src={objectUrl}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />

                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2"
                        onClick={() => removeFile(id)}
                        disabled={isDeleting}
                      >
                        {isDeleting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                      {uploading && !isDeleting && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <div className="text-white font-medium text-lg">
                            {progress}%
                          </div>
                        </div>
                      )}
                      {error && (
                        <div className="absolute inset-0 bg-red-500/50 flex items-center justify-center">
                          <div className="text-white font-medium">Error</div>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate px-1">
                      {file.name}
                    </p>
                  </div>
                );
              }
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
