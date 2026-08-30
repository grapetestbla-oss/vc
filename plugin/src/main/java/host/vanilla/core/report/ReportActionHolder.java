package host.vanilla.core.report;

import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.jetbrains.annotations.NotNull;

/**
 * Меню одного взятого репорта: по нему листенер понимает, к какому репорту
 * относится нажатая кнопка.
 */
public final class ReportActionHolder implements InventoryHolder {

    private final ReportManager.Entry entry;
    private Inventory inventory;

    public ReportActionHolder(ReportManager.Entry entry) {
        this.entry = entry;
    }

    public ReportManager.Entry entry() {
        return entry;
    }

    @Override
    public @NotNull Inventory getInventory() {
        return inventory;
    }

    public void setInventory(Inventory inventory) {
        this.inventory = inventory;
    }
}
