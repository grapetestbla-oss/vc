package host.vanilla.core.report;

import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.jetbrains.annotations.NotNull;

/** Маркер, по которому листенер отличает меню репортов от чужих инвентарей. */
public final class ReportMenuHolder implements InventoryHolder {

    private Inventory inventory;

    @Override
    public @NotNull Inventory getInventory() {
        return inventory;
    }

    public void setInventory(Inventory inventory) {
        this.inventory = inventory;
    }
}
