/** TanStack Query keys for region data. Invalidating `all` refetches every region read. */
export const regionQueryKeys = {
  all: ["regions"] as const,
  municipalities: ["regions", "municipalities"] as const,
  partition: ["regions", "partition"] as const,
  versions: ["regions", "versions"] as const,
  version: (number: number) => ["regions", "versions", number] as const,
};

export const partitionQueryKey = regionQueryKeys.partition;
