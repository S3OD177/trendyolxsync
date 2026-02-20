export interface ProductsSuggestBatchItem {
  productId: string;
  sku: string;
}

export interface ProductsSuggestBatchExecutionResult {
  ok: boolean;
  error?: string;
  status?: number;
  enforcedFloor?: number;
  attemptedPrice?: number;
  projectedProfit?: number;
}

export interface ProductsSuggestBatchFailure {
  productId: string;
  sku: string;
  error: string;
  status?: number;
  enforcedFloor?: number;
  attemptedPrice?: number;
  projectedProfit?: number;
}

export interface ProductsSuggestBatchProgress {
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
}

export interface ProductsSuggestBatchResult {
  total: number;
  succeeded: number;
  failed: number;
  failures: ProductsSuggestBatchFailure[];
}

interface RunProductsSuggestBatchArgs {
  items: ProductsSuggestBatchItem[];
  execute: (item: ProductsSuggestBatchItem) => Promise<ProductsSuggestBatchExecutionResult>;
  concurrency?: number;
  onProgress?: (progress: ProductsSuggestBatchProgress) => void;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown batch update error";
}

export async function runProductsSuggestBatch({
  items,
  execute,
  concurrency = 3,
  onProgress
}: RunProductsSuggestBatchArgs): Promise<ProductsSuggestBatchResult> {
  const total = items.length;
  const workerCount = Math.max(1, Math.min(total || 1, Math.floor(concurrency) || 1));
  const failures: ProductsSuggestBatchFailure[] = [];

  let nextIndex = 0;
  let completed = 0;
  let succeeded = 0;
  let failed = 0;

  const emitProgress = () => {
    onProgress?.({
      total,
      completed,
      succeeded,
      failed
    });
  };

  emitProgress();

  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= total) {
        return;
      }

      const item = items[index];

      try {
        const result = await execute(item);
        if (result.ok) {
          succeeded += 1;
        } else {
          failed += 1;
          failures.push({
            productId: item.productId,
            sku: item.sku,
            error: result.error || "Batch update failed",
            status: result.status,
            enforcedFloor: result.enforcedFloor,
            attemptedPrice: result.attemptedPrice,
            projectedProfit: result.projectedProfit
          });
        }
      } catch (error) {
        failed += 1;
        failures.push({
          productId: item.productId,
          sku: item.sku,
          error: toErrorMessage(error)
        });
      } finally {
        completed += 1;
        emitProgress();
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return {
    total,
    succeeded,
    failed,
    failures
  };
}
