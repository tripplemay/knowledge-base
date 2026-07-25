// 受控开关字段 —— 布局复刻模板 components/fields/SwitchField，
// 但改为受控：模板版本不透传 checked（见 components/switch/index.tsx:21 的 rest 解构），
// 会导致 UI 状态与实际取值反向
import type { ChangeEvent } from 'react';
import Switch from 'components/switch';

function KbSwitchField(props: {
  id: string;
  label: string;
  desc: string;
  mt: string;
  mb: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const { id, label, desc, mt, mb, checked, onChange } = props;
  return (
    <div className={`flex justify-between ${mt} ${mb} items-center`}>
      <label
        htmlFor={id}
        className="max-w-[80%] hover:cursor-pointer lg:max-w-[65%]"
      >
        <h5 className="text-base font-bold text-navy-700 dark:text-white">
          {label}
        </h5>
        <p className="text-base text-gray-600">{desc}</p>
      </label>
      <div>
        <Switch
          id={id}
          checked={checked}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            onChange(e.target.checked)
          }
        />
      </div>
    </div>
  );
}

export default KbSwitchField;
