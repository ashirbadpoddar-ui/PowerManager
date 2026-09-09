import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalSearch, type SearchPage } from "./GlobalSearch";
import { searchRecords } from "@/services/searchApi";

vi.mock("@/services/searchApi", () => ({ searchRecords: vi.fn() }));
const pages: SearchPage[] = [{ kind: "page", id: "billing", title: "Billing & invoices", secondary: "Open page" }];
const record = { kind: "invoice" as const, id: 42, title: "INV-0042", secondary: "Pine · INR 140.00", property_id: null };
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(300); });

describe("GlobalSearch", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.mocked(searchRecords).mockReset(); vi.mocked(searchRecords).mockResolvedValue({ items: [] }); });
  afterEach(() => { vi.useRealTimers(); });

  it("trims partial input, debounces, groups results and selects with keyboard", async () => {
    vi.mocked(searchRecords).mockResolvedValue({ items: [record] });
    const onSelect = vi.fn();
    render(<GlobalSearch pages={pages} onSelect={onSelect} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: " i " } });
    await tick();
    expect(searchRecords).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: " IN " } });
    expect(screen.getByText("Searching records…")).toBeInTheDocument();
    expect(searchRecords).not.toHaveBeenCalled();
    await tick();
    expect(searchRecords).toHaveBeenCalledWith("IN", expect.any(AbortSignal));
    expect(screen.getByRole("group", { name: "Pages" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Invoices" })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(pages[0]);
    expect(input).toHaveValue("");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("ignores old responses, cancels requests and clears pending state", async () => {
    let resolveOld!: (value: { items: typeof record[] }) => void;
    vi.mocked(searchRecords).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    render(<GlobalSearch pages={[]} onSelect={vi.fn()} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "old" } });
    await tick();
    const signal = vi.mocked(searchRecords).mock.calls[0][1];
    fireEvent.change(input, { target: { value: "new" } });
    expect(signal.aborted).toBe(true);
    await tick();
    expect(screen.getByText("No results found.")).toBeInTheDocument();
    await act(async () => { resolveOld({ items: [record] }); });
    expect(screen.queryByText(record.title)).not.toBeInTheDocument();
    vi.mocked(searchRecords).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    fireEvent.change(input, { target: { value: "pending" } });
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(input).toHaveValue("");
    expect(screen.queryByText("Searching records…")).not.toBeInTheDocument();
    await act(async () => { resolveOld({ items: [record] }); });
    expect(screen.queryByText(record.title)).not.toBeInTheDocument();
  });

  it("shows failures, closes on escape/outside, and supports clicking records", async () => {
    vi.mocked(searchRecords).mockRejectedValueOnce(new Error("network"));
    const onSelect = vi.fn();
    render(<GlobalSearch pages={pages} onSelect={onSelect} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "invoice" } });
    await tick();
    expect(screen.getByText(/Unable to search records/)).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    fireEvent.focus(input);
    fireEvent.pointerDown(document.body);
    expect(input).toHaveAttribute("aria-expanded", "false");
    vi.mocked(searchRecords).mockResolvedValue({ items: [record] });
    fireEvent.change(input, { target: { value: "INV-" } });
    await tick();
    fireEvent.click(screen.getByRole("option"));
    expect(onSelect).toHaveBeenCalledWith(record);
  });

  it("cancels a debounce on clear and clears results on account remount", async () => {
    const { rerender } = render(<GlobalSearch key="account1" pages={pages} onSelect={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "invoice" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    await tick();
    expect(searchRecords).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "invoice" } });
    await tick();
    rerender(<GlobalSearch key="account2" pages={[]} onSelect={vi.fn()} />);
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(screen.queryByText("Billing & invoices")).not.toBeInTheDocument();
  });
});
