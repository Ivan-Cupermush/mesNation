import React from 'react';
import styled from 'styled-components';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { theme } from '../styles/theme';

interface DayWithNotes {
  date: string;
  count: number;
}

interface Props {
  currentMonth: Date;
  selectedDate: Date;
  daysWithNotes: DayWithNotes[];
  onDateSelect: (date: Date) => void;
  onMonthChange: (date: Date) => void;
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const CalendarView: React.FC<Props> = ({
  currentMonth,
  selectedDate,
  daysWithNotes,
  onDateSelect,
  onMonthChange,
}) => {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = (firstDay.getDay() + 6) % 7; // Понедельник = 0

  const today = formatLocalDate(new Date());
  const selectedDateStr = formatLocalDate(selectedDate);

  // Мапа дней с заметками
  const notesByDate: Record<string, number> = {};
  daysWithNotes.forEach(d => {
    notesByDate[d.date] = d.count;
  });

  const days: (number | null)[] = [];
  for (let i = 0; i < startDayOfWeek; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const goToMonth = (delta: number) => {
    onMonthChange(new Date(year, month + delta, 1));
  };

  return (
    <Wrapper>
      <Header>
        <NavBtn onClick={() => goToMonth(-1)}>
          <ChevronLeft size={20} />
        </NavBtn>
        <MonthTitle>{MONTHS[month]} {year}</MonthTitle>
        <NavBtn onClick={() => goToMonth(1)}>
          <ChevronRight size={20} />
        </NavBtn>
      </Header>

      <WeekRow>
        {WEEKDAYS.map(d => (
          <WeekDay key={d}>{d}</WeekDay>
        ))}
      </WeekRow>

      <Grid>
        {days.map((day, idx) => {
          if (day === null) return <Cell key={idx} $empty />;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDateStr;
          const hasNotes = notesByDate[dateStr] || 0;

          return (
            <Cell
              key={idx}
              $today={isToday}
              $selected={isSelected}
              $hasNotes={hasNotes > 0}
              onClick={() => onDateSelect(new Date(year, month, day))}
            >
              <DayNum>{day}</DayNum>
              {hasNotes > 0 && (
                <Dots>
                  {Array.from({ length: Math.min(hasNotes, 3) }).map((_, i) => (
                    <Dot key={i} />
                  ))}
                </Dots>
              )}
            </Cell>
          );
        })}
      </Grid>
    </Wrapper>
  );
};

export default CalendarView;

const Wrapper = styled.div`
  background: ${theme.colors.surface};
  border-radius: ${theme.radius.lg};
  padding: 20px;
  box-shadow: ${theme.shadows.card};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
`;

const NavBtn = styled.button`
  width: 36px; height: 36px;
  border-radius: 12px;
  background: ${theme.colors.borderLight};
  display: flex; align-items: center; justify-content: center;
  color: ${theme.colors.textPrimary};
  &:hover { background: ${theme.colors.primaryLight}; color: ${theme.colors.primary}; }
`;

const MonthTitle = styled.div`
  font-family: ${theme.fonts.display};
  font-size: 24px; font-weight: 900;
  color: ${theme.colors.textPrimary};
`;

const WeekRow = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin-bottom: 8px;
`;

const WeekDay = styled.div`
  text-align: center;
  font-size: 11px; font-weight: 700;
  color: ${theme.colors.textSecondary};
  padding: 4px 0;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
`;

const Cell = styled.div<{ $empty?: boolean; $today?: boolean; $selected?: boolean; $hasNotes?: boolean }>`
  aspect-ratio: 1;
  background: ${p => (p.$selected ? theme.colors.primaryLight : p.$today ? '#ECFDF5' : 'transparent')};
  border: 1.5px solid ${p => (p.$today ? theme.colors.primary : 'transparent')};
  border-radius: 10px;
  padding: 6px;
  cursor: ${p => (p.$empty ? 'default' : 'pointer')};
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  transition: background 0.15s;
  position: relative;

  &:hover {
    background: ${p => (p.$empty ? 'transparent' : p.$selected ? theme.colors.primaryLight : theme.colors.borderLight)};
  }
`;

const DayNum = styled.div`
  font-size: 13px; font-weight: 600;
  color: ${theme.colors.textPrimary};
`;

const Dots = styled.div`
  display: flex;
  gap: 3px;
  position: absolute;
  bottom: 6px;
`;

const Dot = styled.div`
  width: 5px; height: 5px;
  border-radius: 50%;
  background: ${theme.colors.primary};
`;
