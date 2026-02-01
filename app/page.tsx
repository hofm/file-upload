import { Uploader } from "@/file-uploader/components/Uploader";

export default function Home() {
  return (
    <div className="p-2">
      <h1 className="text-4xl font-bold pb-10">Upload your Files with S3 📂</h1>
      <Uploader />
    </div>
  );
}
