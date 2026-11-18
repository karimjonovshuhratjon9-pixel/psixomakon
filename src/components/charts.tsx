import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

export function ScoreBar({ percent }: { percent: number }) {
  const tone =
    percent >= 70
      ? "bg-forest-600"
      : percent >= 40
        ? "bg-amber-500"
        : "bg-rose-500";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-forest-100/60">
      <div
        className={`h-full rounded-full ${tone} transition-all duration-700`}
        style={{ width: `${Math.max(2, percent)}%` }}
      />
    </div>
  );
}

export function DimensionRadar({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  if (data.length < 3) return <DimensionBars data={data} />;
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="#e2efe7" />
          <PolarAngleAxis
            dataKey="label"
            tick={{ fill: "#4b5b54", fontSize: 11, fontWeight: 600 }}
          />
          <PolarRadiusAxis
            tick={{ fill: "#9aa8a1", fontSize: 10 }}
            axisLine={false}
          />
          <Radar
            dataKey="value"
            stroke="#285947"
            fill="#458b6d"
            fillOpacity={0.35}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DimensionBars({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  return (
    <div className="space-y-3">
      {data.map((d) => {
        const max = Math.max(...data.map((x) => x.value), 1);
        const pct = (d.value / max) * 100;
        return (
          <div key={d.label}>
            <div className="mb-1 flex items-center justify-between text-[12.5px]">
              <span className="font-semibold text-ink/70">{d.label}</span>
              <span className="font-bold text-forest-800">{d.value}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-forest-100/70">
              <div
                className="h-full rounded-full bg-gradient-to-r from-forest-600 to-sage-400 transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function GroupBarChart({
  data,
}: {
  data: { name: string; percent: number }[];
}) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#efece4"
            vertical={false}
          />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "#6b7a73" }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#9aa8a1" }}
            axisLine={false}
            tickLine={false}
            domain={[0, 100]}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 14,
              border: "1px solid #e8e5dd",
              fontSize: 12,
              boxShadow: "0 10px 30px -12px rgba(22,33,29,.2)",
            }}
            formatter={(v: number) => [`${v}%`, "Natija"]}
          />
          <Bar dataKey="percent" radius={[8, 8, 0, 0]}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={
                  d.percent >= 70
                    ? "#326f56"
                    : d.percent >= 40
                      ? "#d9a520"
                      : "#d95d5d"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
