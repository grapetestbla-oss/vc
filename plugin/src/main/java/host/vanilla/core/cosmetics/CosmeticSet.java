package host.vanilla.core.cosmetics;

import com.google.gson.JsonObject;

import java.util.EnumMap;
import java.util.Map;

/** Активная косметика игрока: по одному предмету на вид. */
public final class CosmeticSet {

    public enum Kind { TRAIL, AURA, PET, HAT, JOIN_EFFECT, NAME_COLOR, TITLE, WORLD_MARK }

    public record Item(String key, Kind kind, JsonObject payload, Integer serial) {}

    private final Map<Kind, Item> items = new EnumMap<>(Kind.class);

    public void put(Item item) {
        items.put(item.kind(), item);
    }

    public Item get(Kind kind) {
        return items.get(kind);
    }

    public boolean has(Kind kind) {
        return items.containsKey(kind);
    }

    public void clear() {
        items.clear();
    }

    public static Kind parseKind(String raw) {
        try {
            return Kind.valueOf(raw);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
