"use client";

import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileRejection, useDropzone } from "react-dropzone";
import { useCallback, useState, useEffect } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { Loader2, Trash2, Upload, FileImage } from "lucide-react";

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

      const response = await fetch("/api/file-uploader", {
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
      const presignedResponse = await fetch("/api/file-uploader", {
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
              {isDragActive ? (
                <p className="text-sm sm:text-base font-medium">
                  Dateien hier ablegen
                </p>
              ) : (
                <>
                  <p className="text-sm sm:text-base font-medium">
                    Bilder hier hochladen
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    oder,{" "}
                    <span className="font-medium text-foreground">
                      klicken zum Durchsuchen
                    </span>{" "}
                    (100MB max)
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {files.length > 0 && (
          <div className="space-y-3">
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
                  <div
                    key={id}
                    className="flex items-center gap-3 rounded-lg border bg-card p-3"
                  >
                    {/* Thumbnail */}
                    <div className="relative shrink-0 w-16 h-16 rounded-md overflow-hidden bg-muted">
                      {objectUrl ? (
                        <img
                          src={objectUrl}
                          alt={file.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <FileImage className="w-full h-full p-4 text-muted-foreground" />
                      )}
                    </div>

                    {/* File Info */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium truncate">
                          {file.name}
                        </p>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                      </div>

                      {/* Progress Bar */}
                      {(uploading || progress > 0) && !error && (
                        <div className="space-y-1">
                          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all duration-300"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {progress}%
                          </p>
                        </div>
                      )}

                      {/* Error State */}
                      {error && (
                        <p className="text-xs text-destructive">
                          Upload fehlgeschlagen
                        </p>
                      )}
                    </div>

                    {/* Delete Button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFile(id)}
                      disabled={isDeleting}
                      className="shrink-0"
                    >
                      {isDeleting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
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
