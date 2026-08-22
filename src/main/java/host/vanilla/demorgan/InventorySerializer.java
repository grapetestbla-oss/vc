package host.vanilla.demorgan;

import org.bukkit.inventory.ItemStack;
import org.bukkit.util.io.BukkitObjectInputStream;
import org.bukkit.util.io.BukkitObjectOutputStream;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Base64;

/** Сериализация инвентаря в Base64 — чтобы пережить рестарт сервера. */
public final class InventorySerializer {

    private InventorySerializer() {}

    public static String toBase64(ItemStack[] contents) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (BukkitObjectOutputStream data = new BukkitObjectOutputStream(out)) {
            data.writeInt(contents.length);
            for (ItemStack item : contents) {
                data.writeObject(item);
            }
        }
        return Base64.getEncoder().encodeToString(out.toByteArray());
    }

    public static ItemStack[] fromBase64(String base64) throws Exception {
        byte[] bytes = Base64.getDecoder().decode(base64);
        try (BukkitObjectInputStream data = new BukkitObjectInputStream(new ByteArrayInputStream(bytes))) {
            ItemStack[] contents = new ItemStack[data.readInt()];
            for (int i = 0; i < contents.length; i++) {
                contents[i] = (ItemStack) data.readObject();
            }
            return contents;
        }
    }
}
