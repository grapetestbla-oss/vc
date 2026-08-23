package host.vanilla.core.util;

import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.World;

/** Локация в строку и обратно — для хранения точки задержания на сайте. */
public final class LocationCodec {

    private LocationCodec() {}

    public static String encode(Location location) {
        if (location == null || location.getWorld() == null) return null;
        return String.join(";",
                location.getWorld().getName(),
                Double.toString(location.getX()),
                Double.toString(location.getY()),
                Double.toString(location.getZ()),
                Float.toString(location.getYaw()),
                Float.toString(location.getPitch()));
    }

    public static Location decode(String encoded) {
        if (encoded == null || encoded.isBlank()) return null;
        String[] parts = encoded.split(";");
        if (parts.length != 6) return null;
        World world = Bukkit.getWorld(parts[0]);
        if (world == null) return null;
        try {
            return new Location(world,
                    Double.parseDouble(parts[1]),
                    Double.parseDouble(parts[2]),
                    Double.parseDouble(parts[3]),
                    Float.parseFloat(parts[4]),
                    Float.parseFloat(parts[5]));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
