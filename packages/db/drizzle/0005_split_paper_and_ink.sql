-- paper_left used to count down one paper pack, which is the ink
-- cassette's count; the paper tray holds 18 of them at a time.
UPDATE "booth" SET
  "ink_left" = "paper_left",
  "ink_cassette_size" = "paper_pack_size",
  "paper_left" = least("paper_left", "paper_tray_size");
