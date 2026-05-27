"use client";

import { useState } from "react";

interface FilterChip {
  id: string;
  label: string;
}

interface DateChip {
  id: string;
  label: string;
  sublabel: string;
  isActive?: boolean;
}

interface MarketFiltersProps {
  categories?: FilterChip[];
  dates?: DateChip[];
  activeCategory?: string;
  activeDate?: string;
  onCategoryChange?: (id: string) => void;
  onDateChange?: (id: string) => void;
}

const defaultCategories: FilterChip[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "winner", label: "Match winner" },
  { id: "exact", label: "Exact score" },
  { id: "popular", label: "High volume" },
];

export function MarketFilters({
  categories = defaultCategories,
  dates = [],
  activeCategory = "all",
  activeDate,
  onCategoryChange,
  onDateChange,
}: MarketFiltersProps) {
  const [selectedCategory, setSelectedCategory] = useState(activeCategory);
  const [selectedDate, setSelectedDate] = useState(activeDate);

  const handleCategoryClick = (id: string) => {
    setSelectedCategory(id);
    onCategoryChange?.(id);
  };

  const handleDateClick = (id: string) => {
    setSelectedDate(id);
    onDateChange?.(id);
  };

  return (
    <section className="control-row" aria-label="Market filters">
      <div className="chip-group" data-filter-group="category">
        {categories.map((cat) => (
          <button
            key={cat.id}
            className={`chip ${selectedCategory === cat.id ? "is-active" : ""}`}
            type="button"
            onClick={() => handleCategoryClick(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>
      
      {dates.length > 0 && (
        <div className="chip-group date-chips" data-filter-group="date">
          {dates.map((date) => (
            <button
              key={date.id}
              className={`date-chip ${selectedDate === date.id ? "is-active" : ""}`}
              type="button"
              onClick={() => handleDateClick(date.id)}
            >
              {date.label}
              <span>{date.sublabel}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
