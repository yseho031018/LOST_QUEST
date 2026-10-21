package com.lostquest.validation;

/** Optional WGS84 pair; legacy text-only posts keep both values null. */
public final class ItemCoordinates {
    private ItemCoordinates() { }

    public static boolean valid(Double latitude, Double longitude) {
        if (latitude == null || longitude == null) return latitude == null && longitude == null;
        return Double.isFinite(latitude) && Double.isFinite(longitude)
                && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
    }
}
