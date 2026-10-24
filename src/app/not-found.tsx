import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Stranica } from "@/components/ui";

export default function NijePronadeno() {
  return (
    <Stranica>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <Logo velik />
        <h1 className="text-2xl font-bold">Stranica ne postoji</h1>
        <p className="text-tekst-2">Možda je link pogrešan ili je stranica premještena.</p>
        <Link
          href="/"
          className="inline-flex h-14 items-center justify-center rounded-2xl bg-linear-to-r from-vatra to-vatra-2 px-8 text-lg font-semibold text-white"
        >
          Na početnu
        </Link>
      </div>
    </Stranica>
  );
}
