export interface PrinterStatus {
  ok: boolean;
  detail: string;
}

export interface Printer {
  readonly kind: "fake" | "cups";
  /** Sends one landscape postcard JPEG and resolves when the printer has taken it. */
  print(absPath: string): Promise<void>;
  status(): Promise<PrinterStatus>;
}

/** Takes a moment, prints nothing. The paper counter still comes down. */
export class FakePrinter implements Printer {
  readonly kind = "fake" as const;
  constructor(private readonly printMs = 1500) {}

  async print(): Promise<void> {
    await new Promise((r) => setTimeout(r, this.printMs));
  }

  async status(): Promise<PrinterStatus> {
    return { ok: true, detail: "Fake printer (nothing comes out)" };
  }
}

export function printerFor(kind: string | undefined): Printer {
  switch (kind ?? "fake") {
    case "fake":
      return new FakePrinter();
    case "cups":
      throw new Error("The CUPS printer arrives in phase 4; use fake for now");
    default:
      throw new Error(`Unknown BOOTH_PRINTER "${kind}"`);
  }
}
