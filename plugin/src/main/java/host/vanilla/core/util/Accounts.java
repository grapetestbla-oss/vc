package host.vanilla.core.util;

import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

/**
 * Имя аккаунта на сайте.
 *
 * Floodgate добавляет Bedrock-игрокам префикс (по умолчанию точку), чтобы их
 * ники не сталкивались с Java-никами. Сайту про этот префикс знать незачем:
 * аккаунт один и тот же, с какого бы клиента человек ни зашёл. Поэтому перед
 * любым обращением к API префикс снимается.
 */
public final class Accounts {

    private static String prefix = ".";

    private Accounts() {}

    public static void setPrefix(String value) {
        prefix = value == null ? "" : value;
    }

    public static String name(Player player) {
        return name(player.getName());
    }

    public static String name(String rawName) {
        if (rawName == null || prefix.isEmpty()) return rawName;
        return rawName.startsWith(prefix) ? rawName.substring(prefix.length()) : rawName;
    }

    /**
     * Ищет игрока по имени в любой форме: админ может написать как ник с сайта
     * («Nick»), так и то, что видно в игре у Bedrock-игрока («.Nick»).
     */
    public static Player findOnline(String name) {
        if (name == null || name.isBlank()) return null;
        Player exact = Bukkit.getPlayerExact(name);
        if (exact != null) return exact;
        if (prefix.isEmpty()) return null;
        return name.startsWith(prefix)
                ? Bukkit.getPlayerExact(name.substring(prefix.length()))
                : Bukkit.getPlayerExact(prefix + name);
    }

    /** Пришёл ли игрок с Bedrock-клиента — видно по префиксу в нике. */
    public static boolean isBedrock(Player player) {
        return !prefix.isEmpty() && player.getName().startsWith(prefix);
    }
}
